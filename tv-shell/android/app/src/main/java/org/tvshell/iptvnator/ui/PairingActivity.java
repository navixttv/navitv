package org.tvshell.iptvnator.ui;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONObject;
import org.tvshell.iptvnator.R;
import org.tvshell.iptvnator.server.PairingServer;

import java.util.EnumMap;
import java.util.Map;

/**
 * NaviTV "Add from phone": shows a QR code and a 6-digit code; a phone on the
 * same Wi-Fi opens the page, types an Xtream login or M3U link, and the source
 * comes back to the page as the activity result.
 */
public final class PairingActivity extends Activity {
    static final String RESULT_SOURCE = "source";

    private static final long TIMEOUT_MS = 10 * 60_000;
    private static final int BG = Color.rgb(0x14, 0x15, 0x1b);
    private static final int ACCENT = Color.rgb(0xf5, 0xa6, 0x23);
    private static final int MUTED = Color.rgb(0xa3, 0xa4, 0xb2);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PairingServer server;
    private TextView status;
    private boolean done;

    private final Runnable timeout = new Runnable() {
        @Override
        public void run() {
            finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        server = PairingServer.start(new PairingServer.Listener() {
            @Override
            public void onSource(final JSONObject source) {
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        received(source);
                    }
                });
            }

            @Override
            public void onLocked() {
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (status != null) status.setText(R.string.pairing_locked);
                    }
                });
            }
        });

        String phoneUrl = server == null ? null : server.phoneUrl();
        setContentView(phoneUrl == null ? noNetworkView() : pairingView(phoneUrl));
        handler.postDelayed(timeout, TIMEOUT_MS);
    }

    private View pairingView(String phoneUrl) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(BG);
        int pad = dp(48);
        root.setPadding(pad, pad, pad, pad);

        ImageView qr = new ImageView(this);
        int size = dp(300);
        qr.setImageBitmap(qrCode(phoneUrl, size));
        qr.setContentDescription(getString(R.string.pairing_qr_description));
        LinearLayout.LayoutParams qrParams = new LinearLayout.LayoutParams(size, size);
        qrParams.setMarginEnd(dp(48));
        root.addView(qr, qrParams);

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        root.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        text.addView(label(getString(R.string.pairing_title), 30, Color.WHITE, true));
        text.addView(spacer(16));
        text.addView(label(getString(R.string.pairing_step_scan), 20, Color.WHITE, false));
        text.addView(spacer(8));
        text.addView(label(getString(R.string.pairing_step_type), 20, Color.WHITE, false));
        text.addView(spacer(8));
        text.addView(label(getString(R.string.pairing_step_send), 20, Color.WHITE, false));
        text.addView(spacer(24));
        text.addView(label(getString(R.string.pairing_manual, server.shortUrl()), 18, MUTED, false));
        text.addView(spacer(8));
        text.addView(label(getString(R.string.pairing_code_label), 18, MUTED, false));
        text.addView(label(formatCode(server.code()), 44, ACCENT, true));
        text.addView(spacer(20));
        status = label(getString(R.string.pairing_waiting), 18, MUTED, false);
        text.addView(status);
        text.addView(spacer(12));
        text.addView(label(getString(R.string.pairing_back_hint), 16, MUTED, false));
        return root;
    }

    private View noNetworkView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(BG);
        int pad = dp(48);
        root.setPadding(pad, pad, pad, pad);
        root.addView(label(getString(R.string.pairing_title), 30, Color.WHITE, true));
        root.addView(spacer(16));
        root.addView(label(getString(server == null
            ? R.string.pairing_unavailable : R.string.pairing_no_network), 20, MUTED, false));
        return root;
    }

    private void received(JSONObject source) {
        if (done) return;
        done = true;
        String title = source.optString("title", "");
        if (status != null) {
            status.setTextColor(ACCENT);
            status.setText(title.isEmpty()
                ? getString(R.string.pairing_received)
                : getString(R.string.pairing_received_named, title));
        }
        Intent data = new Intent();
        data.putExtra(RESULT_SOURCE, source.toString());
        setResult(RESULT_OK, data);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
            }
        }, 1500);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (server != null) {
            final PairingServer stopping = server;
            server = null;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    stopping.stop();
                }
            }, "pairing-stop").start();
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------------ views
    private static String formatCode(String code) {
        return code.length() == 6 ? code.substring(0, 3) + " " + code.substring(3) : code;
    }

    private TextView label(String value, int sp, int colour, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(colour);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private View spacer(int heightDp) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, dp(heightDp)));
        return view;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private static Bitmap qrCode(String text, int size) {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 2);
            BitMatrix matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints);
            int[] pixels = new int[size * size];
            for (int y = 0; y < size; y++) {
                for (int x = 0; x < size; x++) {
                    pixels[y * size + x] = matrix.get(x, y) ? Color.BLACK : Color.WHITE;
                }
            }
            return Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888);
        } catch (Exception e) {
            return Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        }
    }
}
