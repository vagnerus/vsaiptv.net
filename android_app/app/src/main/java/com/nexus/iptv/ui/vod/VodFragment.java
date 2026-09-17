package com.nexus.iptv.ui.vod;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.model.Category;
import com.nexus.iptv.data.model.VodContent;
import com.nexus.iptv.data.repository.IptvRepository;
import com.nexus.iptv.ui.adapter.CategoryAdapter;
import com.nexus.iptv.ui.adapter.VodAdapter;
import com.nexus.iptv.ui.player.PlayerActivity;
import java.util.List;

public class VodFragment extends Fragment {
    private RecyclerView rvVodCategories, rvMovies;
    private ProgressBar pbVod;
    private TextView tvEmptyVod;
    private IptvRepository repository;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_vod, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        repository = app.getRepository();

        rvVodCategories = view.findViewById(R.id.rvVodCategories);
        rvMovies = view.findViewById(R.id.rvMovies);
        pbVod = view.findViewById(R.id.pbVod);
        tvEmptyVod = view.findViewById(R.id.tvEmptyVod);

        rvVodCategories.setLayoutManager(new LinearLayoutManager(getContext(), LinearLayoutManager.HORIZONTAL, false));
        rvMovies.setLayoutManager(new GridLayoutManager(getContext(), 2));

        loadCategories();
        loadMovies("all");

        return view;
    }

    private void loadCategories() {
        repository.getCategories("movie", new IptvRepository.DataCallback<List<Category>>() {
            @Override
            public void onSuccess(List<Category> categories) {
                if (!isAdded()) return;
                CategoryAdapter adapter = new CategoryAdapter(categories, category -> {
                    loadMovies(category.getId());
                });
                rvVodCategories.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {}
        });
    }

    private void loadMovies(String categoryId) {
        if (pbVod != null) pbVod.setVisibility(View.VISIBLE);
        if (tvEmptyVod != null) tvEmptyVod.setVisibility(View.GONE);

        repository.getVodMovies(categoryId, new IptvRepository.DataCallback<List<VodContent>>() {
            @Override
            public void onSuccess(List<VodContent> movies) {
                if (!isAdded()) return;
                if (pbVod != null) pbVod.setVisibility(View.GONE);

                if (movies == null || movies.isEmpty()) {
                    if (tvEmptyVod != null) {
                        tvEmptyVod.setText("Nenhum filme encontrado nesta categoria.");
                        tvEmptyVod.setVisibility(View.VISIBLE);
                    }
                    rvMovies.setAdapter(null);
                    return;
                }

                if (tvEmptyVod != null) tvEmptyVod.setVisibility(View.GONE);

                VodAdapter adapter = new VodAdapter(movies, movie -> {
                    Intent intent = new Intent(getContext(), PlayerActivity.class);
                    intent.putExtra("stream_url", movie.getStreamUrl());
                    intent.putExtra("title", movie.getName());
                    intent.putExtra("type", "movie");
                    startActivity(intent);
                });
                rvMovies.setAdapter(adapter);
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                if (pbVod != null) pbVod.setVisibility(View.GONE);
                if (tvEmptyVod != null) {
                    tvEmptyVod.setText("Erro ao carregar filmes: " + message);
                    tvEmptyVod.setVisibility(View.VISIBLE);
                }
            }
        });
    }
}
