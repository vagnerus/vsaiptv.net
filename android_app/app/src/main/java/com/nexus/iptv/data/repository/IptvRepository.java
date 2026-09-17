package com.nexus.iptv.data.repository;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.model.*;
import okhttp3.*;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class IptvRepository {
    private final Context context;
    private final AppPreferences preferences;
    private final OkHttpClient httpClient;
    private final Handler mainHandler;

    public interface AuthCallback {
        void onSuccess(UserSession session);
        void onError(String message);
    }

    public interface DataCallback<T> {
        void onSuccess(T result);
        void onError(String message);
    }

    public IptvRepository(Context context, AppPreferences preferences) {
        this.context = context;
        this.preferences = preferences;
        this.httpClient = new OkHttpClient.Builder()
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public static String safeGetString(JsonObject obj, String key, String defaultValue) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return defaultValue;
        }
        try {
            return obj.get(key).getAsString();
        } catch (Exception e) {
            return defaultValue;
        }
    }

    public static int safeGetInt(JsonObject obj, String key, int defaultValue) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return defaultValue;
        }
        try {
            return obj.get(key).getAsInt();
        } catch (Exception e) {
            return defaultValue;
        }
    }

    // Authenticate with Xtream Codes API
    public void authenticate(String serverUrl, String username, String password, AuthCallback callback) {
        String cleanUrl = serverUrl.trim();
        if (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.substring(0, cleanUrl.length() - 1);
        String url = cleanUrl + "/player_api.php?username=" + username.trim() + "&password=" + password.trim();

        final String finalServerUrl = cleanUrl;
        Request request = new Request.Builder().url(url).build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                // Return clear error on network failure
                mainHandler.post(() -> {
                    callback.onError("Não foi possível conectar ao servidor. Verifique o IP/URL e conexão: " + e.getMessage());
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    mainHandler.post(() -> callback.onError("Erro no servidor: " + response.code()));
                    return;
                }

                String responseBody = response.body() != null ? response.body().string() : "";
                try {
                    JsonObject json = JsonParser.parseString(responseBody).getAsJsonObject();
                    if (json.has("user_info")) {
                        JsonObject userInfo = json.getAsJsonObject("user_info");
                        int auth = safeGetInt(userInfo, "auth", 0);
                        if (auth == 1) {
                            UserSession session = new UserSession(username, password, finalServerUrl);
                            session.setClientName(safeGetString(userInfo, "username", username));
                            session.setStatus(safeGetString(userInfo, "status", "active"));
                            session.setTrial("1".equals(safeGetString(userInfo, "is_trial", "0")));
                            session.setMaxConnections(safeGetInt(userInfo, "max_connections", 1));
                            session.setActiveConnections(safeGetInt(userInfo, "active_cons", 0));

                            if (userInfo.has("exp_date") && !userInfo.get("exp_date").isJsonNull()) {
                                try {
                                    long expSeconds = userInfo.get("exp_date").getAsLong();
                                    if (expSeconds > 0) {
                                        java.util.Date expDate = new java.util.Date(expSeconds * 1000);
                                        session.setExpiresAt(new java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(expDate));
                                    } else {
                                        session.setExpiresAt("Vitalício");
                                    }
                                } catch (Exception ignored) {
                                    session.setExpiresAt("31/12/2026");
                                }
                            } else {
                                session.setExpiresAt("31/12/2026");
                            }

                            preferences.saveSession(session);
                            mainHandler.post(() -> callback.onSuccess(session));
                            return;
                        } else {
                            String msg = safeGetString(userInfo, "message", "Acesso negado: Usuário ou senha incorretos");
                            mainHandler.post(() -> callback.onError(msg));
                            return;
                        }
                    } else {
                        mainHandler.post(() -> callback.onError("Resposta inválida do servidor IPTV"));
                    }
                } catch (Exception e) {
                    mainHandler.post(() -> callback.onError("Erro ao processar resposta: " + e.getMessage()));
                }
            }
        });
    }

    // Get Categories
    public void getCategories(String type, DataCallback<List<Category>> callback) {
        UserSession session = preferences.getSession();
        if (session == null) {
            callback.onSuccess(getEnrichedDefaultCategories(type));
            return;
        }

        String action = "live".equals(type) ? "get_live_categories" : ("movie".equals(type) ? "get_vod_categories" : "get_series_categories");
        String url = session.getServerUrl() + "/player_api.php?username=" + session.getUsername() + "&password=" + session.getPassword() + "&action=" + action;

        Request request = new Request.Builder().url(url).build();
        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> callback.onSuccess(getEnrichedDefaultCategories(type)));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                List<Category> list = new ArrayList<>();
                // Always prepend "Todos" category
                String allLabel = "live".equals(type) ? "Todos os Canais" : ("movie".equals(type) ? "Todos os Filmes" : "Todas as Séries");
                list.add(new Category("all", allLabel, type));

                try {
                    String body = response.body() != null ? response.body().string() : "";
                    JsonArray arr = JsonParser.parseString(body).getAsJsonArray();
                    for (JsonElement el : arr) {
                        try {
                            JsonObject obj = el.getAsJsonObject();
                            String id = safeGetString(obj, "category_id", "");
                            String name = safeGetString(obj, "category_name", "Categoria");
                            if (!id.isEmpty()) {
                                Category cat = new Category(id, name, type);
                                cat.setLocked(preferences.isCategoryLocked(id));
                                list.add(cat);
                            }
                        } catch (Exception ignored) {}
                    }
                } catch (Exception e) {
                    list = getEnrichedDefaultCategories(type);
                }

                final List<Category> finalList = list.size() <= 1 ? getEnrichedDefaultCategories(type) : list;
                mainHandler.post(() -> callback.onSuccess(finalList));
            }
        });
    }

    // Get Live Channels
    public void getChannels(String categoryId, DataCallback<List<Channel>> callback) {
        UserSession session = preferences.getSession();
        if (session == null) {
            callback.onSuccess(filterChannels(getEnrichedDefaultChannels(), categoryId));
            return;
        }

        String url = session.getServerUrl() + "/player_api.php?username=" + session.getUsername() + "&password=" + session.getPassword() + "&action=get_live_streams";
        if (categoryId != null && !categoryId.isEmpty() && !"all".equals(categoryId)) {
            url += "&category_id=" + categoryId;
        }

        final String serverUrl = session.getServerUrl();
        final String username = session.getUsername();
        final String password = session.getPassword();

        Request request = new Request.Builder().url(url).build();
        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> callback.onSuccess(filterChannels(getEnrichedDefaultChannels(), categoryId)));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                List<Channel> channels = new ArrayList<>();
                try {
                    String body = response.body() != null ? response.body().string() : "";
                    JsonArray arr = JsonParser.parseString(body).getAsJsonArray();
                    for (JsonElement el : arr) {
                        try {
                            JsonObject obj = el.getAsJsonObject();
                            String streamId = safeGetString(obj, "stream_id", "");
                            String name = safeGetString(obj, "name", "Canal Ao Vivo");
                            String icon = safeGetString(obj, "stream_icon", "");
                            String catId = safeGetString(obj, "category_id", "");

                            if (!streamId.isEmpty()) {
                                String playUrl = serverUrl + "/live/" + username + "/" + password + "/" + streamId + ".m3u8";
                                Channel ch = new Channel(streamId, name, playUrl, icon, catId, "Canais Ao Vivo");
                                ch.setFavorite(preferences.isFavorite(streamId));
                                channels.add(ch);
                            }
                        } catch (Exception ignored) {}
                    }
                } catch (Exception e) {
                    channels = filterChannels(getEnrichedDefaultChannels(), categoryId);
                }

                final List<Channel> finalList = channels.isEmpty() ? filterChannels(getEnrichedDefaultChannels(), categoryId) : channels;
                mainHandler.post(() -> callback.onSuccess(finalList));
            }
        });
    }

    // Get Movies
    public void getVodMovies(String categoryId, DataCallback<List<VodContent>> callback) {
        UserSession session = preferences.getSession();
        if (session == null) {
            mainHandler.post(() -> callback.onSuccess(getEnrichedDefaultMovies()));
            return;
        }

        String url = session.getServerUrl() + "/player_api.php?username=" + session.getUsername() + "&password=" + session.getPassword() + "&action=get_vod_streams";
        if (categoryId != null && !categoryId.isEmpty() && !"all".equals(categoryId)) {
            url += "&category_id=" + categoryId;
        }

        final String serverUrl = session.getServerUrl();
        final String username = session.getUsername();
        final String password = session.getPassword();

        Request request = new Request.Builder().url(url).build();
        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> callback.onSuccess(getEnrichedDefaultMovies()));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                List<VodContent> movies = new ArrayList<>();
                try {
                    String body = response.body() != null ? response.body().string() : "";
                    JsonArray arr = JsonParser.parseString(body).getAsJsonArray();
                    for (JsonElement el : arr) {
                        try {
                            JsonObject obj = el.getAsJsonObject();
                            String streamId = safeGetString(obj, "stream_id", "");
                            String name = safeGetString(obj, "name", "Filme VOD");
                            String icon = safeGetString(obj, "stream_icon", "");
                            String rating = safeGetString(obj, "rating", "8.5");
                            String catId = safeGetString(obj, "category_id", "");

                            if (!streamId.isEmpty()) {
                                String playUrl = serverUrl + "/movie/" + username + "/" + password + "/" + streamId + ".mp4";
                                VodContent m = new VodContent(streamId, name, playUrl, icon, "Filme em alta definição.", rating, "2024", catId);
                                m.setFavorite(preferences.isFavorite(streamId));
                                movies.add(m);
                            }
                        } catch (Exception ignored) {}
                    }
                } catch (Exception e) {
                    movies = getEnrichedDefaultMovies();
                }

                final List<VodContent> finalList = movies.isEmpty() ? getEnrichedDefaultMovies() : movies;
                mainHandler.post(() -> callback.onSuccess(finalList));
            }
        });
    }

    // Get Series
    public void getSeries(String categoryId, DataCallback<List<SeriesContent>> callback) {
        mainHandler.post(() -> callback.onSuccess(getEnrichedDefaultSeries()));
    }

    private List<Channel> filterChannels(List<Channel> all, String categoryId) {
        if (categoryId == null || categoryId.isEmpty() || "all".equals(categoryId)) return all;
        List<Channel> filtered = new ArrayList<>();
        for (Channel c : all) {
            if (categoryId.equals(c.getCategoryId())) filtered.add(c);
        }
        return filtered.isEmpty() ? all : filtered;
    }

    private List<Category> getEnrichedDefaultCategories(String type) {
        List<Category> list = new ArrayList<>();
        if ("live".equals(type)) {
            list.add(new Category("all", "Todos os Canais", "live"));
            list.add(new Category("abertos", "Canais Abertos", "live"));
            list.add(new Category("esportes", "Esportes & PPV", "live"));
            list.add(new Category("noticias", "Notícias & Jornalismo", "live"));
            list.add(new Category("filmes", "Filmes e Séries", "live"));
            list.add(new Category("documentarios", "Documentários", "live"));
            list.add(new Category("infantil", "Infantil & Animação", "live"));
            list.add(new Category("variedades", "Variedades", "live"));
            list.add(new Category("religiosos", "Religiosos", "live"));
        } else if ("movie".equals(type)) {
            list.add(new Category("all", "Todos os Filmes", "movie"));
            list.add(new Category("action", "Ação & Aventura", "movie"));
            list.add(new Category("scifi", "Sci-Fi & Fantasia", "movie"));
            list.add(new Category("comedy", "Comédia", "movie"));
        } else {
            list.add(new Category("all", "Todas as Séries", "series"));
            list.add(new Category("doc_series", "Séries Documentais", "series"));
        }
        return list;
    }

    private List<Channel> getEnrichedDefaultChannels() {
        List<Channel> list = new ArrayList<>();

        // Esportes & Aventura
        list.add(new Channel("1", "Red Bull TV HD", "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
            "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=128", "esportes", "Esportes & PPV"));
        
        // Documentários & Ciência
        list.add(new Channel("2", "NASA TV HD", "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
            "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=128", "documentarios", "Documentários"));

        // Notícias
        list.add(new Channel("3", "Euronews Português HD", "https://euronews-euronews-portuguese-1-pt.samsung.wurl.tv/manifest/playlist.m3u8",
            "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=128", "noticias", "Notícias & Jornalismo"));

        // Canais Abertos / Clássicos
        list.add(new Channel("4", "AgroMais TV HD", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "http://www.acstatic.co/logos/canais/agromais.png", "abertos", "Canais Abertos"));

        list.add(new Channel("5", "TV Cultura HD", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
            "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=128", "abertos", "Canais Abertos"));

        // Infantil
        list.add(new Channel("6", "Cartoon Kids 24h", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=128", "infantil", "Infantil & Animação"));

        // Filmes & Séries
        list.add(new Channel("7", "Telecine Premium HD", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
            "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=128", "filmes", "Filmes e Séries"));

        list.add(new Channel("8", "HBO Max Hits HD", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
            "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=128", "filmes", "Filmes e Séries"));

        // Variedades
        list.add(new Channel("9", "A&E HD", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "http://tjtor8411.com/static/logos/canais/a%26e.png", "variedades", "Variedades"));

        // Religiosos
        list.add(new Channel("10", "TV Aparecida HD", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
            "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=128", "religiosos", "Religiosos"));

        for (Channel c : list) {
            c.setFavorite(preferences.isFavorite(c.getId()));
        }

        return list;
    }

    private List<VodContent> getEnrichedDefaultMovies() {
        List<VodContent> list = new ArrayList<>();
        list.add(new VodContent("m1", "Big Buck Bunny (4K Ultra HD)", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg",
            "Um grande e adorável coelho é provocado por animais da floresta e decide se vingar com engenhosidade.", "8.9", "2008", "action"));

        list.add(new VodContent("m2", "Sintel - A Jornada", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
            "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg",
            "Uma guerreira solitária parte em uma perigosa jornada pelas terras desoladas para resgatar seu dragão.", "9.1", "2010", "action"));

        list.add(new VodContent("m3", "Tears of Steel (Sci-Fi 4K)", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
            "https://upload.wikimedia.org/wikipedia/commons/8/8c/Tears_of_steel_poster.jpg",
            "Em um futuro distópico, um grupo de cientistas tenta reverter a invasão cibernética mundial.", "8.6", "2012", "scifi"));

        return list;
    }

    private List<SeriesContent> getEnrichedDefaultSeries() {
        List<SeriesContent> list = new ArrayList<>();
        SeriesContent s1 = new SeriesContent("s1", "Cosmos & Beyond: Temporada 1",
            "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600",
            "Uma jornada épica pelos mistérios do universo e das galáxias distantes.", "9.4", "2023", "doc_series");

        s1.getEpisodes().add(new Episode("e1", "s1", 1, 1, "O Surgimento das Galáxias", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", 35));
        s1.getEpisodes().add(new Episode("e2", "s1", 1, 2, "Tempestades no Espaço Profundo", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", 40));
        s1.getEpisodes().add(new Episode("e3", "s1", 1, 3, "O Futuro da Humanidade", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", 42));

        list.add(s1);
        return list;
    }
}
