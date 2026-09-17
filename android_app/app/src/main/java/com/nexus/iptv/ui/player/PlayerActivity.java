package com.nexus.iptv.ui.player;

import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import com.nexus.iptv.R;

public class PlayerActivity extends AppCompatActivity {
    private PlayerView playerView;
    private ExoPlayer player;
    private ProgressBar progressBar;
    private TextView tvPlayerTitle, tvPlayerSubtitle;
    private Button btnBack;
    private String streamUrl;
    private String title;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);

        streamUrl = getIntent().getStringExtra("stream_url");
        title = getIntent().getStringExtra("title");

        playerView = findViewById(R.id.playerView);
        progressBar = findViewById(R.id.playerProgressBar);
        tvPlayerTitle = findViewById(R.id.tvPlayerTitle);
        tvPlayerSubtitle = findViewById(R.id.tvPlayerSubtitle);
        btnBack = findViewById(R.id.btnBack);

        if (title != null) tvPlayerTitle.setText(title);

        btnBack.setOnClickListener(v -> finish());

        initPlayer();
    }

    private void initPlayer() {
        if (streamUrl == null || streamUrl.isEmpty()) {
            Toast.makeText(this, "URL de transmissão não disponível.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(streamUrl));
        player.setMediaItem(mediaItem);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_BUFFERING) {
                    progressBar.setVisibility(View.VISIBLE);
                } else if (playbackState == Player.STATE_READY) {
                    progressBar.setVisibility(View.GONE);
                } else if (playbackState == Player.STATE_ENDED) {
                    finish();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                progressBar.setVisibility(View.GONE);
                Toast.makeText(PlayerActivity.this, "Reconectando transmissão...", Toast.LENGTH_SHORT).show();
                // Attempt automatic reconnect
                if (player != null) {
                    player.prepare();
                    player.play();
                }
            }
        });

        player.prepare();
        player.play();
    }

    // Android TV / D-Pad Remote Control Support
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (player == null) return super.onKeyDown(keyCode, event);

        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                if (player.isPlaying()) {
                    player.pause();
                } else {
                    player.play();
                }
                return true;

            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                player.seekTo(Math.max(0, player.getCurrentPosition() - 10000));
                return true;

            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                player.seekTo(Math.min(player.getDuration(), player.getCurrentPosition() + 10000));
                return true;

            case KeyEvent.KEYCODE_BACK:
                finish();
                return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
