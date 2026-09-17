package com.nexus.iptv.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.model.VodContent;
import com.nexus.iptv.utils.ImageLoader;
import java.util.List;

public class VodAdapter extends RecyclerView.Adapter<VodAdapter.ViewHolder> {
    private final List<VodContent> movies;
    private final OnVodClickListener listener;

    public interface OnVodClickListener {
        void onVodClick(VodContent movie);
    }

    public VodAdapter(List<VodContent> movies, OnVodClickListener listener) {
        this.movies = movies;
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_vod_card, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        VodContent m = movies.get(position);
        holder.tvVodTitle.setText(m.getName());
        holder.tvVodYear.setText(m.getYear() != null && !m.getYear().isEmpty() ? m.getYear() + " • Full HD" : "Full HD");
        holder.tvVodRating.setText("★ " + (m.getRating() != null ? m.getRating() : "8.5"));

        // Load poster asynchronously
        ImageLoader.getInstance().load(
            m.getPosterUrl(),
            holder.ivVodPoster,
            holder.tvVodPosterPlaceholder,
            NexusApplication.getInstance().getAppPreferences().getServerUrl()
        );

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onVodClick(m);
        });
    }

    @Override
    public int getItemCount() {
        return movies != null ? movies.size() : 0;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvVodTitle, tvVodYear, tvVodRating, tvVodPosterPlaceholder;
        ImageView ivVodPoster;

        ViewHolder(View itemView) {
            super(itemView);
            tvVodTitle = itemView.findViewById(R.id.tvVodTitle);
            tvVodYear = itemView.findViewById(R.id.tvVodYear);
            tvVodRating = itemView.findViewById(R.id.tvVodRating);
            tvVodPosterPlaceholder = itemView.findViewById(R.id.tvVodPosterPlaceholder);
            ivVodPoster = itemView.findViewById(R.id.ivVodPoster);
        }
    }
}
