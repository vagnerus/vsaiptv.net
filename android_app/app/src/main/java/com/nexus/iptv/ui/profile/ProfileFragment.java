package com.nexus.iptv.ui.profile;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.model.UserSession;
import com.nexus.iptv.ui.login.LoginActivity;

public class ProfileFragment extends Fragment {
    private TextView tvProfileName, tvProfileUsername, tvProfileStatus, tvProfileExpires, tvProfileScreens, tvProfileReseller;
    private Button btnLogout;
    private AppPreferences preferences;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_profile, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        preferences = app.getAppPreferences();

        tvProfileName = view.findViewById(R.id.tvProfileName);
        tvProfileUsername = view.findViewById(R.id.tvProfileUsername);
        tvProfileStatus = view.findViewById(R.id.tvProfileStatus);
        tvProfileExpires = view.findViewById(R.id.tvProfileExpires);
        tvProfileScreens = view.findViewById(R.id.tvProfileScreens);
        tvProfileReseller = view.findViewById(R.id.tvProfileReseller);
        btnLogout = view.findViewById(R.id.btnLogout);

        UserSession session = preferences.getSession();
        if (session != null) {
            tvProfileName.setText(session.getClientName());
            tvProfileUsername.setText("@" + session.getUsername());
            tvProfileStatus.setText("Status: " + ("active".equals(session.getStatus()) ? "Ativo" : "Expirado"));
            tvProfileExpires.setText("Válido até: " + (session.getExpiresAt() != null ? session.getExpiresAt() : "Vitalício"));
            tvProfileScreens.setText("Telas Permitidas: " + session.getMaxConnections() + " simultânea(s)");
            tvProfileReseller.setText("Revendedor Responsável: " + (session.getResellerContact() != null && !session.getResellerContact().isEmpty() ? session.getResellerContact() : "Revenda Oficial Nexus"));
        }

        btnLogout.setOnClickListener(v -> {
            preferences.clearSession();
            Intent intent = new Intent(getContext(), LoginActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(intent);
        });

        return view;
    }
}
