import React, { useState, useEffect } from 'react';
import { Tv, QrCode, KeyRound, ArrowLeft, Loader2 } from 'lucide-react';

/**
 * TVLoginModal — Interface de autenticação facilitada para telas de TV
 * Permite autenticação rápida por pareamento (QR Code / Código temporário) ou formulário amigável.
 */
export default function TVLoginModal({ onStandardLoginClick, onAuthenticated }) {
  const [pairCode, setPairCode] = useState('');
  const [expiresIn, setExpiresIn] = useState(300); // 5 minutos
  const [isPolling, setIsPolling] = useState(false);

  // Gera código temporário de pareamento para exibição na TV
  useEffect(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    code += '-';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    setPairCode(code);

    const timer = setInterval(() => {
      setExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      borderRadius: '20px',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      padding: '40px',
      maxWidth: '800px',
      margin: '0 auto',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
      textAlign: 'center',
      color: '#f8fafc'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
        <Tv size={36} color="#38bdf8" />
        <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 'bold' }}>VSAIPTV Smart TV</h1>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '32px' }}>
        Conecte sua conta com facilidade através do celular ou computador
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'center', textAlign: 'left' }}>
        {/* Painel do Código */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{ fontSize: '0.95rem', color: '#94a3b8', marginBottom: '8px' }}>
            Acesse no celular: <b>vsa.tv/link</b>
          </span>
          <div style={{
            fontSize: '2.4rem',
            fontWeight: '900',
            letterSpacing: '4px',
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.1)',
            padding: '12px 24px',
            borderRadius: '10px',
            margin: '16px 0',
            border: '2px dashed #38bdf8'
          }}>
            {pairCode}
          </div>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Expira em: <span style={{ color: '#f59e0b' }}>{formatTime(expiresIn)}</span>
          </span>
        </div>

        {/* Painel Instruções & Alternativa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ background: '#38bdf8', color: '#0f172a', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>
              1
            </div>
            <p style={{ margin: 0, fontSize: '1rem', color: '#cbd5e1' }}>
              Abra a câmera do seu celular e aponte para a tela ou abra o link do painel.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ background: '#38bdf8', color: '#0f172a', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>
              2
            </div>
            <p style={{ margin: 0, fontSize: '1rem', color: '#cbd5e1' }}>
              Digite o código <b>{pairCode}</b> exibido ao lado para vincular este dispositivo.
            </p>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={onStandardLoginClick}
              tabIndex={0}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#f8fafc',
                padding: '12px 20px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <KeyRound size={18} />
              Digitar Usuário e Senha no Controle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
