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
import com.nexus.iptv.data.model.Channel;
import com.nexus.iptv.utils.ImageLoader;
import java.util.List;

public class ChannelAdapter extends RecyclerView.Adapter<ChannelAdapter.ViewHolder> {
    private final List<Channel> channels;
    private final OnChannelClickListener listener;
    private final OnFavoriteToggleListener favoriteListener;

    public interface OnChannelClickListener {
        void onChannelClick(Channel channel);
    }

    public interface OnFavoriteToggleListener {
        void onFavoriteToggle(Channel channel);
    }

    public ChannelAdapter(List<Channel> channels, OnChannelClickListener listener, OnFavoriteToggleListener favoriteListener) {
        this.channels = channels;
        this.listener = listener;
        this.favoriteListener = favoriteListener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_channel, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Channel ch = channels.get(position);
        holder.tvChannelName.setText(ch.getName());
        holder.tvCurrentProgram.setText(ch.getCurrentProgram() != null ? ch.getCurrentProgram() : "No Ar: Programação Especial");
        holder.tvNextProgram.setText(ch.getNextProgram() != null ? ch.getNextProgram() : "Transmissão P2P Otimizada");

        holder.tvFavoriteStar.setText(ch.isFavorite() ? "★" : "☆");

        // Abbreviate logo text for placeholder
        String shortName = ch.getName().length() > 3 ? ch.getName().substring(0, 3).toUpperCase() : ch.getName();
        holder.tvLogoPlaceholder.setText(shortName);

        // Load channel icon asynchronously
        ImageLoader.getInstance().load(
            ch.getLogoUrl(),
            holder.ivChannelLogo,
            holder.tvLogoPlaceholder,
            NexusApplication.getInstance().getAppPreferences().getServerUrl()
        );

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onChannelClick(ch);
        });

        holder.tvFavoriteStar.setOnClickListener(v -> {
            ch.setFavorite(!ch.isFavorite());
            notifyItemChanged(position);
            if (favoriteListener != null) favoriteListener.onFavoriteToggle(ch);
        });
    }

    @Override
    public int getItemCount() {
        return channels != null ? channels.size() : 0;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvChannelName, tvCurrentProgram, tvNextProgram, tvLogoPlaceholder, tvFavoriteStar;
        ImageView ivChannelLogo;

        ViewHolder(View itemView) {
            super(itemView);
            tvChannelName = itemView.findViewById(R.id.tvChannelName);
            tvCurrentProgram = itemView.findViewById(R.id.tvCurrentProgram);
            tvNextProgram = itemView.findViewById(R.id.tvNextProgram);
            tvLogoPlaceholder = itemView.findViewById(R.id.tvLogoPlaceholder);
            tvFavoriteStar = itemView.findViewById(R.id.tvFavoriteStar);
            ivChannelLogo = itemView.findViewById(R.id.ivChannelLogo);
        }
    }
}
