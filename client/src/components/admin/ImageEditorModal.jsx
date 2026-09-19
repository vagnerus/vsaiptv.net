import React, { useState, useRef } from 'react';
import { 
  X, Upload, Image as ImageIcon, Check, RefreshCw, 
  ZoomIn, ZoomOut, Crop, AlertCircle, Link as LinkIcon, ExternalLink
} from 'lucide-react';
import api from '../../services/api';

export default function ImageEditorModal({ stream, onClose, onUpdated, notify }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'url' | 'presets'
  const [imageUrl, setImageUrl] = useState(stream?.poster_url || stream?.icon_url || '');
  const [selectedField, setSelectedField] = useState(
    stream?.type === 'movie' || stream?.type === 'series' ? 'poster' : 'icon'
  );
  const [aspectRatio, setAspectRatio] = useState(
    stream?.type === 'movie' || stream?.type === 'series' ? '2:3' : '16:9'
  );
  
  const [previewFile, setPreviewFile] = useState(null);
  const [previewBase64, setPreviewBase64] = useState('');
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  if (!stream) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (< 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Arquivo excede o limite máximo permitido de 10 MB.');
      return;
    }

    // Validate MIME
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setErrorMsg('Formato inválido. Selecione apenas imagens JPEG, PNG ou WebP.');
      return;
    }

    setErrorMsg('');
    setPreviewFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUpload = async () => {
    if (!previewBase64) {
      setErrorMsg('Selecione uma imagem antes de salvar.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const res = await api.post(`/api/admin/streams/${stream.id}/image-upload`, {
        base64: previewBase64,
        field: selectedField
      });

      if (res.data.success) {
        if (notify) notify('Imagem enviada e aplicada com sucesso!', 'success');
        if (onUpdated) onUpdated(res.data.url, selectedField);
        onClose();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || 'Erro ao processar e salvar a imagem.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!imageUrl.trim()) {
      setErrorMsg('Informe uma URL de imagem válida.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const payload = selectedField === 'poster' 
        ? { poster_url: imageUrl.trim() } 
        : { icon_url: imageUrl.trim() };

      const res = await api.put(`/api/admin/streams/${stream.id}/image`, payload);

      if (res.data.success) {
        if (notify) notify('URL da imagem atualizada com sucesso!', 'success');
        if (onUpdated) onUpdated(imageUrl.trim(), selectedField);
        onClose();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || 'Erro ao salvar a URL da imagem.');
    } finally {
      setSaving(false);
    }
  };

  const currentActiveImage = previewBase64 || imageUrl || (selectedField === 'poster' ? stream.poster_url : stream.icon_url);

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 7, 15, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '20px'
    }}>
      <div style={{
        background: '#131828',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.2)',
              color: '#a78bfa',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Crop size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
                Editor de Imagem & Enquadramento
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {stream.name} (ID: #{stream.id})
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#fca5a5',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Config row: Field Target & Aspect Ratio Preset */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                Destino no Catálogo
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedField('icon')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: selectedField === 'icon' ? '1px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: selectedField === 'icon' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    color: selectedField === 'icon' ? '#fff' : '#94a3b8',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Logo / Ícone
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedField('poster')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: selectedField === 'poster' ? '1px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: selectedField === 'poster' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    color: selectedField === 'poster' ? '#fff' : '#94a3b8',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Poster Vertical
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                Enquadramento (Aspect Ratio)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: aspectRatio === '16:9' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: aspectRatio === '16:9' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    color: aspectRatio === '16:9' ? '#fff' : '#94a3b8',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  16:9 (Canal/Banner)
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('2:3')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: aspectRatio === '2:3' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: aspectRatio === '2:3' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    color: aspectRatio === '2:3' ? '#fff' : '#94a3b8',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  2:3 (Filmes/Séries)
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Preview Canvas */}
          <div style={{
            background: '#090d16',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '220px'
          }}>
            <div style={{
              width: aspectRatio === '2:3' ? '160px' : '280px',
              height: aspectRatio === '2:3' ? '240px' : '158px',
              borderRadius: '8px',
              border: '2px dashed #a78bfa',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#1a1f33'
            }}>
              {currentActiveImage ? (
                <img
                  src={currentActiveImage}
                  alt={stream.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: aspectRatio === '2:3' ? 'cover' : 'contain',
                    transform: `scale(${zoom})`,
                    transition: 'transform 0.15s ease'
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}

              <div style={{
                display: currentActiveImage ? 'none' : 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                color: '#64748b',
                fontSize: '0.8rem'
              }}>
                <ImageIcon size={32} />
                <span>Nenhuma imagem selecionada</span>
              </div>
            </div>

            {/* Zoom Controls */}
            {currentActiveImage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setZoom(Math.max(0.7, zoom - 0.1))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 10px', cursor: 'pointer' }}
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Zoom: {Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 10px', cursor: 'pointer' }}
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#94a3b8', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Mode Switch Tabs: Upload or URL */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === 'upload' ? '2px solid #a78bfa' : '2px solid transparent',
                color: activeTab === 'upload' ? '#fff' : '#94a3b8',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Upload size={16} />
              <span>Upload Local (JPEG/PNG/WebP)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === 'url' ? '2px solid #a78bfa' : '2px solid transparent',
                color: activeTab === 'url' ? '#fff' : '#94a3b8',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <LinkIcon size={16} />
              <span>URL Externa</span>
            </button>
          </div>

          {/* Tab 1: Upload */}
          {activeTab === 'upload' && (
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed rgba(139, 92, 246, 0.4)',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'rgba(139, 92, 246, 0.05)',
                  transition: 'border-color 0.2s ease'
                }}
              >
                <Upload size={28} color="#a78bfa" style={{ marginBottom: '8px' }} />
                <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#f1f5f9' }}>
                  {previewFile ? previewFile.name : 'Clique para selecionar arquivo de imagem'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                  Suporta JPEG, PNG e WebP com validação binária segura (máx. 10MB)
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: External URL */}
          {activeTab === 'url' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                Endereço URL da Imagem
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://exemplo.com/poster.jpg"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#090d16',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(10, 13, 22, 0.6)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>

          {activeTab === 'upload' ? (
            <button
              type="button"
              onClick={handleSaveUpload}
              disabled={saving || !previewBase64}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                background: saving || !previewBase64 ? '#4b5563' : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: saving || !previewBase64 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
              <span>{saving ? 'Processando...' : 'Aplicar Upload'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveUrl}
              disabled={saving || !imageUrl.trim()}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                background: saving || !imageUrl.trim() ? '#4b5563' : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: saving || !imageUrl.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
              <span>{saving ? 'Salvando...' : 'Salvar URL'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
