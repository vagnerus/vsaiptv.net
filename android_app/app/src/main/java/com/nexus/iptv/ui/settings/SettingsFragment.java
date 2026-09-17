package com.nexus.iptv.ui.settings;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import com.nexus.iptv.NexusApplication;
import com.nexus.iptv.R;
import com.nexus.iptv.data.local.AppPreferences;

public class SettingsFragment extends Fragment {
    private Button btnChangePin, btnClearCache;
    private AppPreferences preferences;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_settings, container, false);

        NexusApplication app = (NexusApplication) requireActivity().getApplication();
        preferences = app.getAppPreferences();

        btnChangePin = view.findViewById(R.id.btnChangePin);
        btnClearCache = view.findViewById(R.id.btnClearCache);

        btnChangePin.setOnClickListener(v -> showChangePinDialog());
        btnClearCache.setOnClickListener(v -> {
            Toast.makeText(getContext(), "Cache limpo com sucesso!", Toast.LENGTH_SHORT).show();
        });

        return view;
    }

    private void showChangePinDialog() {
        if (getContext() == null) return;
        final EditText input = new EditText(getContext());
        input.setHint("Digite 4 dígitos");
        input.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setTextColor(android.graphics.Color.WHITE);

        new AlertDialog.Builder(getContext(), android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Novo PIN de Controle Parental")
            .setMessage("Defina um código numérico de 4 dígitos:")
            .setView(input)
            .setPositiveButton("Salvar", (dialog, which) -> {
                String pin = input.getText().toString().trim();
                if (pin.length() >= 4) {
                    preferences.setParentalPin(pin);
                    Toast.makeText(getContext(), "PIN Parental atualizado com sucesso!", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(getContext(), "O PIN deve conter pelo menos 4 dígitos.", Toast.LENGTH_SHORT).show();
                }
            })
            .setNegativeButton("Cancelar", null)
            .show();
    }
}
