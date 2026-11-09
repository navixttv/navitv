package org.tvshell.iptvnator.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.PlayerView;

import org.tvshell.iptvnator.R;
import org.tvshell.iptvnator.ShellApp;
import org.tvshell.iptvnator.backend.DiagnosticRedactor;

/**
 * NaviTV's built-in player (Media3 / ExoPlayer). Plays what the WebView cannot:
 * MKV, raw MPEG-TS, HEVC / 10-bit video and AC3 / E-AC3 audio, through the
 * device's own hardware decoders. Films and episodes resume where they stopped.
 *
 * Remote: OK / Play-Pause toggles, Left / Right seek 10 s (30 s held), Up / Down
 * show the controls, Back closes. The result reports the last position so the
 * page can follow.
 */
@OptIn(markerClass = UnstableApi.class)
public final class NativePlayerActivity extends Activity {
    static final String EXTRA_URL = "url";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_LIVE = "live";
    static final String EXTRA_USER_AGENT = "userAgent";

    static final String RESULT_POSITION_MS = "positionMs";
    static final String RESULT_DURATION_MS = "durationMs";
    static final String RESULT_ENDED = "ended";
    static final String RESULT_FAILED = "failed";

    private static final String POSITIONS = "native_player_positions";
    private static final long SEEK_STEP_MS = 10_000;
    private static final long RESUME_MIN_MS = 30_000;
    private static final long RESUME_END_MARGIN_MS = 90_000;
    private static final int TIMEOUT_MS = 30_000;

    private PlayerView playerView;
    private ExoPlayer player;
    private String url;
    private String title;
    private boolean live;
    private String userAgent;
    private boolean ended;
    private boolean failed;
    private long lastPositionMs;
    private long lastDurationMs;
    private AlertDialog errorDialog;

    /** Opens the player for a stream. */
    static Intent intent(Context context, String url, String title, boolean live, String userAgent) {
        Intent intent = new Intent(context, NativePlayerActivity.class);
        intent.putExtra(EXTRA_URL, url);
        intent.putExtra(EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(EXTRA_LIVE, live);
        if (userAgent != null && !userAgent.isEmpty()) intent.putExtra(EXTRA_USER_AGENT, userAgent);
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Intent intent = getIntent();
        url = intent.getStringExtra(EXTRA_URL);
        title = intent.getStringExtra(EXTRA_TITLE);
        live = intent.getBooleanExtra(EXTRA_LIVE, false);
        userAgent = intent.getStringExtra(EXTRA_USER_AGENT);
        if (url == null || url.trim().isEmpty()) {
            finishWithResult();
            return;
        }
        url = url.trim();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        playerView = new PlayerView(this);
        playerView.setKeepScreenOn(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setControllerShowTimeoutMs(4000);
        playerView.setControllerAutoShow(true);
        playerView.setFocusable(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        playerView.requestFocus();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (url != null && player == null) startPlayer();
    }

    @Override
    protected void onStop() {
        super.onStop();
        releasePlayer();
    }

    private void startPlayer() {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(TIMEOUT_MS)
            .setReadTimeoutMs(TIMEOUT_MS);
        if (userAgent != null && !userAgent.isEmpty()) http.setUserAgent(userAgent);

        DefaultExtractorsFactory extractors = new DefaultExtractorsFactory()
            // Seeking in files without an index (some MKV / TS films).
            .setConstantBitrateSeekingEnabled(true)
            .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES
                | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS);

        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
            .setEnableDecoderFallback(true);

        player = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(http, extractors))
            .setSeekBackIncrementMs(SEEK_STEP_MS)
            .setSeekForwardIncrementMs(SEEK_STEP_MS)
            .build();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build(), true);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    ended = true;
                    forgetPosition();
                    finishWithResult();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.w(ShellApp.TAG, "native player error: " + error.getErrorCodeName()
                    + " " + DiagnosticRedactor.redact(String.valueOf(error.getMessage())));
                failed = true;
                showError();
            }
        });
        playerView.setPlayer(player);

        MediaItem.Builder item = new MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build());
        String lower = url.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains(".m3u8")) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        else if (lower.contains(".mpd")) item.setMimeType(MimeTypes.APPLICATION_MPD);
        player.setMediaItem(item.build());

        long resumeAt = live ? 0 : savedPosition();
        if (resumeAt > 0) player.seekTo(resumeAt);
        player.setPlayWhenReady(true);
        player.prepare();
    }

    private void releasePlayer() {
        if (player == null) return;
        rememberPosition();
        player.release();
        player = null;
        if (playerView != null) playerView.setPlayer(null);
    }

    // ------------------------------------------------------------- remote keys
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (player == null || errorDialog != null) return super.dispatchKeyEvent(event);
        int code = event.getKeyCode();
        boolean controlsVisible = playerView.isControllerFullyVisible();
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            switch (code) {
                case KeyEvent.KEYCODE_BACK:
                    if (controlsVisible && event.getRepeatCount() == 0) {
                        playerView.hideController();
                        return true;
                    }
                    finishWithResult();
                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    // With the controls hidden, Left / Right seek; shown, they move focus.
                    if (!controlsVisible && !live) {
                        long step = event.getRepeatCount() > 2 ? 3 * SEEK_STEP_MS : SEEK_STEP_MS;
                        long target = player.getCurrentPosition()
                            + (code == KeyEvent.KEYCODE_DPAD_RIGHT ? step : -step);
                        long duration = player.getDuration();
                        if (duration != C.TIME_UNSET) target = Math.min(target, Math.max(0, duration - 1000));
                        player.seekTo(Math.max(0, target));
                        playerView.showController();
                        return true;
                    }
                    break;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (!controlsVisible) {
                        togglePlayPause();
                        playerView.showController();
                        return true;
                    }
                    break;
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (!controlsVisible) {
                        playerView.showController();
                        return true;
                    }
                    break;
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_HEADSETHOOK:
                    togglePlayPause();
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                    player.play();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                    player.pause();
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                    if (!live) player.seekForward();
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                    if (!live) player.seekBack();
                    playerView.showController();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_STOP:
                    finishWithResult();
                    return true;
                default:
                    break;
            }
        } else if (event.getAction() == KeyEvent.ACTION_UP && code == KeyEvent.KEYCODE_BACK) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void togglePlayPause() {
        if (player == null) return;
        if (player.isPlaying()) player.pause();
        else player.play();
    }

    // ------------------------------------------------------------------ errors
    private void showError() {
        if (isFinishing() || errorDialog != null) return;
        errorDialog = new AlertDialog.Builder(this)
            .setTitle(R.string.native_player_error_title)
            .setMessage(getString(R.string.native_player_error_message,
                title == null || title.isEmpty() ? "" : title))
            .setPositiveButton(R.string.native_player_retry, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    failed = false;
                    if (player != null) {
                        player.prepare();
                        player.play();
                    }
                }
            })
            .setNeutralButton(R.string.native_player_open_external, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    String target = url;
                    String name = title;
                    finishWithResult();
                    ExternalPlayer.open(getApplicationContext(), target, name, null);
                }
            })
            .setNegativeButton(R.string.native_player_close, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    finishWithResult();
                }
            })
            .setOnDismissListener(new DialogInterface.OnDismissListener() {
                @Override
                public void onDismiss(DialogInterface dialog) {
                    errorDialog = null;
                    if (playerView != null) playerView.requestFocus();
                }
            })
            .show();
    }

    // ----------------------------------------------------------------- resume
    /** Positions are keyed by a hash of the URL: the URL itself carries credentials. */
    private String positionKey() {
        return "p" + Integer.toHexString(url.hashCode()) + "_" + url.length();
    }

    private SharedPreferences positions() {
        return getSharedPreferences(POSITIONS, MODE_PRIVATE);
    }

    private long savedPosition() {
        return positions().getLong(positionKey(), 0);
    }

    private void rememberPosition() {
        if (player == null) return;
        lastPositionMs = Math.max(0, player.getCurrentPosition());
        long duration = player.getDuration();
        lastDurationMs = duration == C.TIME_UNSET ? 0 : duration;
        if (live || ended) return;
        SharedPreferences.Editor editor = positions().edit();
        boolean nearEnd = lastDurationMs > 0 && lastPositionMs > lastDurationMs - RESUME_END_MARGIN_MS;
        if (lastPositionMs < RESUME_MIN_MS || nearEnd) editor.remove(positionKey());
        else editor.putLong(positionKey(), lastPositionMs);
        editor.apply();
    }

    private void forgetPosition() {
        positions().edit().remove(positionKey()).apply();
    }

    private void finishWithResult() {
        if (player != null) rememberPosition();
        Intent data = new Intent();
        data.putExtra(EXTRA_URL, url);
        data.putExtra(RESULT_POSITION_MS, lastPositionMs);
        data.putExtra(RESULT_DURATION_MS, lastDurationMs);
        data.putExtra(RESULT_ENDED, ended);
        data.putExtra(RESULT_FAILED, failed);
        setResult(RESULT_OK, data);
        if (errorDialog != null) {
            errorDialog.setOnDismissListener(null);
            errorDialog.dismiss();
            errorDialog = null;
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        finishWithResult();
    }

    @Override
    protected void onDestroy() {
        if (errorDialog != null) {
            errorDialog.setOnDismissListener(null);
            errorDialog.dismiss();
            errorDialog = null;
        }
        releasePlayer();
        super.onDestroy();
    }

    /** Hides the system bars on devices that show them (phones running the TV build). */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && playerView != null) {
            playerView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }
}
