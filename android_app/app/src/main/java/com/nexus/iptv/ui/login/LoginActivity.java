package com.nexus.iptv.ui.login;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.local.AppPreferences;
import com.nexus.iptv.data.model.UserSession;
import com.nexus.iptv.data.repository.IptvRepository;
import com.nexus.iptv.ui.main.MainActivity;

public class LoginActivity extends AppCompatActivity {
    private EditText etServerUrl, etUsername, etPassword;
    private Button btnLogin, btnDemo;
    private ProgressBar progressBar;
    private TextView tvError;
    private IptvRepository repository;
    private AppPreferences preferences;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        NexusApplication app = (NexusApplication) getApplication();
        repository = app.getRepository();
        preferences = app.getAppPreferences();

        // Check if already logged in
        if (preferences.isLoggedIn()) {
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }

        setContentView(R.layout.activity_login);

        etServerUrl = findViewById(R.id.etServerUrl);
        etUsername = findViewById(R.id.etUsername);
        etPassword = findViewById(R.id.etPassword);
        btnLogin = findViewById(R.id.btnLogin);
        btnDemo = findViewById(R.id.btnDemo);
        progressBar = findViewById(R.id.progressBar);
        tvError = findViewById(R.id.tvError);

        etServerUrl.setText(preferences.getServerUrl());

        btnLogin.setOnClickListener(v -> performLogin(false));
        btnDemo.setOnClickListener(v -> performLogin(true));
    }

    private void performLogin(boolean isDemo) {
        tvError.setVisibility(View.GONE);

        if (isDemo) {
            UserSession demoSession = new UserSession("joaosilva", "cliente123", etServerUrl.getText().toString().trim());
            demoSession.setClientName("João Silva (Demonstração)");
            demoSession.setExpiresAt("31/12/2026");
            demoSession.setMaxConnections(2);
            demoSession.setActiveConnections(1);
            demoSession.setStatus("active");
            preferences.saveSession(demoSession);

            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }

        String serverUrl = etServerUrl.getText().toString().trim();
        String username = etUsername.getText().toString().trim();
        String password = etPassword.getText().toString().trim();

        if (serverUrl.isEmpty() || username.isEmpty() || password.isEmpty()) {
            tvError.setText(R.string.err_empty_fields);
            tvError.setVisibility(View.VISIBLE);
            return;
        }

        preferences.setServerUrl(serverUrl);
        progressBar.setVisibility(View.VISIBLE);
        btnLogin.setEnabled(false);

        repository.authenticate(serverUrl, username, password, new IptvRepository.AuthCallback() {
            @Override
            public void onSuccess(UserSession session) {
                progressBar.setVisibility(View.GONE);
                btnLogin.setEnabled(true);
                startActivity(new Intent(LoginActivity.this, MainActivity.class));
                finish();
            }

            @Override
            public void onError(String message) {
                progressBar.setVisibility(View.GONE);
                btnLogin.setEnabled(true);
                tvError.setText(message);
                tvError.setVisibility(View.VISIBLE);
            }
        });
    }
}
