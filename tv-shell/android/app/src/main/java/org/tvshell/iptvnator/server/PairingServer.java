package org.tvshell.iptvnator.server;

import android.util.Log;

import org.json.JSONObject;
import org.tvshell.iptvnator.ShellApp;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * NaviTV "Add from phone": a small web page on the home network where a phone
 * types an Xtream login or an M3U link for this TV.
 *
 * It listens on every interface (a phone must reach it) but only while the
 * pairing screen is open, and accepts a source only with the 6-digit code shown
 * on the TV. Too many wrong codes close it. Nothing it receives is logged.
 */
public final class PairingServer extends NanoHTTPD {
    /** First port tried; the next few are used when it is taken. */
    public static final int BASE_PORT = 43350;
    private static final int MAX_BODY_BYTES = 16 * 1024;
    private static final int MAX_FAILED_CODES = 8;
    private static final int MAX_FIELD = 2048;

    /** Receives a valid source, on a server thread. */
    public interface Listener {
        void onSource(JSONObject source);

        /** Too many wrong codes: the server stopped itself. */
        void onLocked();
    }

    private final String code;
    private final Listener listener;
    private int failedCodes;
    private boolean received;

    private PairingServer(int port, String code, Listener listener) {
        super(port);
        this.code = code;
        this.listener = listener;
    }

    /** Starts on the first free port from {@link #BASE_PORT}; null when none is free. */
    public static PairingServer start(Listener listener) {
        String code = newCode();
        for (int port = BASE_PORT; port < BASE_PORT + 5; port++) {
            PairingServer server = new PairingServer(port, code, listener);
            try {
                server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true);
                return server;
            } catch (IOException e) {
                Log.i(ShellApp.TAG, "pairing port " + port + " busy");
            }
        }
        return null;
    }

    public String code() {
        return code;
    }

    public int port() {
        return getListeningPort();
    }

    /** The URL a phone opens (the QR code), or null without a home-network address. */
    public String phoneUrl() {
        String address = lanAddress();
        return address == null ? null : "http://" + address + ":" + port() + "/?c=" + code;
    }

    /** Typed by hand: the address without the code. */
    public String shortUrl() {
        String address = lanAddress();
        return address == null ? null : "http://" + address + ":" + port();
    }

    private static String newCode() {
        SecureRandom random = new SecureRandom();
        return String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
    }

    /** This device's IPv4 address on the home network (Wi-Fi or Ethernet). */
    public static String lanAddress() {
        try {
            String fallback = null;
            for (NetworkInterface face : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!face.isUp() || face.isLoopback() || face.isVirtual()) continue;
                for (InetAddress address : Collections.list(face.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || address.isLoopbackAddress()) continue;
                    String name = face.getName() == null ? "" : face.getName();
                    if (address.isSiteLocalAddress()
                        && (name.startsWith("wlan") || name.startsWith("eth"))) {
                        return address.getHostAddress();
                    }
                    if (address.isSiteLocalAddress() && fallback == null) {
                        fallback = address.getHostAddress();
                    }
                }
            }
            return fallback;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public Response serve(IHTTPSession session) {
        try {
            String path = session.getUri();
            if (Method.GET.equals(session.getMethod()) && ("/".equals(path) || "/index.html".equals(path))) {
                return page(PairingPage.HTML);
            }
            if (Method.POST.equals(session.getMethod()) && "/add".equals(path)) {
                return add(session);
            }
            return json(Response.Status.NOT_FOUND, "{\"ok\":false,\"error\":\"not_found\"}");
        } catch (Throwable t) {
            Log.w(ShellApp.TAG, "pairing request failed: " + t.getClass().getSimpleName());
            return json(Response.Status.INTERNAL_ERROR, "{\"ok\":false,\"error\":\"server\"}");
        }
    }

    private synchronized Response add(IHTTPSession session) throws Exception {
        if (received) return json(Response.Status.OK, "{\"ok\":false,\"error\":\"done\"}");
        String length = session.getHeaders().get("content-length");
        long declared = -1;
        try {
            if (length != null) declared = Long.parseLong(length.trim());
        } catch (NumberFormatException ignored) {
            declared = -1;
        }
        if (declared < 0 || declared > MAX_BODY_BYTES) {
            return json(Response.Status.BAD_REQUEST, "{\"ok\":false,\"error\":\"too_large\"}");
        }
        Map<String, String> files = new HashMap<>();
        session.parseBody(files);
        Map<String, String> form = new HashMap<>();
        for (Map.Entry<String, java.util.List<String>> entry : session.getParameters().entrySet()) {
            if (!entry.getValue().isEmpty()) form.put(entry.getKey(), entry.getValue().get(0));
        }

        if (!sameCode(field(form, "code", 16).replaceAll("\\s", ""))) {
            failedCodes++;
            if (failedCodes >= MAX_FAILED_CODES) {
                listener.onLocked();
                stopSoon();
                return json(Response.Status.FORBIDDEN, "{\"ok\":false,\"error\":\"locked\"}");
            }
            return json(Response.Status.FORBIDDEN, "{\"ok\":false,\"error\":\"code\"}");
        }

        String type = field(form, "type", 16);
        JSONObject source = new JSONObject();
        String title = field(form, "title", 200);
        if (!title.isEmpty()) source.put("title", title);
        if ("xtream".equals(type)) {
            String server = field(form, "serverUrl", MAX_FIELD);
            String username = field(form, "username", 512);
            String password = field(form, "password", 512);
            if (server.isEmpty() || username.isEmpty() || password.isEmpty()) {
                return json(Response.Status.BAD_REQUEST, "{\"ok\":false,\"error\":\"missing\"}");
            }
            if (!server.matches("(?i)^https?://.*")) server = "http://" + server;
            source.put("type", "xtream");
            source.put("serverUrl", server);
            source.put("username", username);
            source.put("password", password);
        } else if ("m3u".equals(type)) {
            String url = field(form, "url", MAX_FIELD);
            if (!url.matches("(?i)^https?://.+")) {
                return json(Response.Status.BAD_REQUEST, "{\"ok\":false,\"error\":\"url\"}");
            }
            source.put("type", "m3u");
            source.put("url", url);
        } else {
            return json(Response.Status.BAD_REQUEST, "{\"ok\":false,\"error\":\"type\"}");
        }
        received = true;
        listener.onSource(source);
        return json(Response.Status.OK, "{\"ok\":true}");
    }

    private boolean sameCode(String candidate) {
        return MessageDigest.isEqual(
            candidate.getBytes(StandardCharsets.UTF_8),
            code.getBytes(StandardCharsets.UTF_8));
    }

    private static String field(Map<String, String> form, String name, int max) {
        String value = form.get(name);
        if (value == null) return "";
        value = value.trim();
        return value.length() > max ? value.substring(0, max) : value;
    }

    private void stopSoon() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                stop();
            }
        }, "pairing-stop").start();
    }

    private static Response page(String html) {
        Response response = newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", html);
        response.addHeader("Cache-Control", "no-store");
        response.addHeader("X-Content-Type-Options", "nosniff");
        response.addHeader("Referrer-Policy", "no-referrer");
        response.addHeader("Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'");
        return response;
    }

    private static Response json(Response.Status status, String body) {
        Response response = newFixedLengthResponse(status, "application/json; charset=utf-8", body);
        response.addHeader("Cache-Control", "no-store");
        return response;
    }
}
