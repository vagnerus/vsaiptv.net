package com.nexus.iptv.utils;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.view.View;
import android.widget.ImageView;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

public class ImageLoader {
    private static ImageLoader instance;
    private final LruCache<String, Bitmap> memoryCache;
    private final OkHttpClient client;
    private final Handler mainHandler;

    private ImageLoader() {
        int maxMemory = (int) (Runtime.getRuntime().maxMemory() / 1024);
        int cacheSize = maxMemory / 8; // 1/8th of runtime memory
        memoryCache = new LruCache<String, Bitmap>(cacheSize) {
            @Override
            protected int sizeOf(String key, Bitmap bitmap) {
                return bitmap.getByteCount() / 1024;
            }
        };
        client = new OkHttpClient.Builder()
            .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
            .build();
        mainHandler = new Handler(Looper.getMainLooper());
    }

    public static synchronized ImageLoader getInstance() {
        if (instance == null) {
            instance = new ImageLoader();
        }
        return instance;
    }

    public void load(String url, ImageView imageView, View placeholderView) {
        load(url, imageView, placeholderView, null);
    }

    public void load(String url, ImageView imageView, View placeholderView, String serverBaseUrl) {
        if (url == null || url.trim().isEmpty()) {
            imageView.setVisibility(View.GONE);
            if (placeholderView != null) placeholderView.setVisibility(View.VISIBLE);
            return;
        }

        String finalUrl = normalizeImageUrl(url.trim(), serverBaseUrl);

        imageView.setTag(finalUrl);
        Bitmap cached = memoryCache.get(finalUrl);
        if (cached != null) {
            imageView.setImageBitmap(cached);
            imageView.setVisibility(View.VISIBLE);
            if (placeholderView != null) placeholderView.setVisibility(View.GONE);
            return;
        }

        // Show placeholder while loading
        if (placeholderView != null) placeholderView.setVisibility(View.VISIBLE);

        Request request = new Request.Builder()
            .url(finalUrl)
            .header("User-Agent", "Mozilla/5.0 (Linux; Android) NexusIPTV/1.0")
            .build();
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> {
                    if (placeholderView != null) placeholderView.setVisibility(View.VISIBLE);
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful() && response.body() != null) {
                    byte[] bytes = response.body().bytes();
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap != null) {
                        memoryCache.put(url, bitmap);
                        mainHandler.post(() -> {
                            if (finalUrl.equals(imageView.getTag())) {
                                imageView.setImageBitmap(bitmap);
                                imageView.setVisibility(View.VISIBLE);
                                if (placeholderView != null) placeholderView.setVisibility(View.GONE);
                            }
                        });
                    }
                }
            }
        });
    }

    private String normalizeImageUrl(String url, String serverBaseUrl) {
        if (serverBaseUrl == null || serverBaseUrl.trim().isEmpty()) return url;
        String base = serverBaseUrl.trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);

        if (url.startsWith("//")) url = "https:" + url;
        if (url.startsWith("/")) return base + url;

        // Proxy imagens externas pelo servidor logado. Isso resolve hotlink,
        // mixed content e provedores que bloqueiam WebView/Android direto.
        if (url.startsWith("http://") || url.startsWith("https://")) {
            if (url.startsWith(base)) return url;
            try {
                return base + "/api/img?url=" + URLEncoder.encode(url, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                return url;
            }
        }

        return base + "/" + url;
    }
}
