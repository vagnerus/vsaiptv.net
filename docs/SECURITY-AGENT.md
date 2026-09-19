# VSAIPTV — Agente de Segurança Defensivo

## Princípios

O Agente de Segurança opera com **zero destrutividade**: todas as ações autônomas são reversíveis e auditadas. Nenhuma ação destrutiva pode ser executada de forma autônoma.

---

## Ameaças Detectadas

### 1. Brute-Force de Login

**Regra**: ≥ 5 falhas de login do mesmo IP em 5 minutos.

**Ação**: Bloqueio temporário do IP (inserção na tabela `firewall_rules`).

**Reversível**: Sim — expira automaticamente ou pode ser removido manualmente via painel Master.

### 2. Probes de Rotas Não Autorizadas

**Regra**: ≥ 10 requisições 404 do mesmo IP em 2 minutos.

**Ação**: Auditoria registrada em `audit_logs`.

**Escalona para Master** se persistir.

### 3. Divergência de Sessão

**Regra**: Token válido usado com IP/User-Agent diferente do registro original.

**Ação**: Invalidação da sessão específica (marcação no banco como revogada).

---

## Ações Autorizadas

| Ação | Reversível | Auditada |
|------|-----------|----------|
| Bloqueio de IP (24h) | ✅ Sim | ✅ Sim |
| Invalidação de sessão | ✅ Sim (re-login) | ✅ Sim |
| Moderação de mensagem | ✅ Sim | ✅ Sim |
| Registro de auditoria | ✅ N/A | ✅ Sim |
| Alerta no Master Inbox | ✅ N/A | ✅ Sim |

---

## Ações BLOQUEADAS

As seguintes ações são **terminantemente proibidas** para qualquer agente de IA:

- ❌ Excluir usuários
- ❌ Apagar tabelas ou banco de dados
- ❌ Executar comandos arbitrários do sistema operacional
- ❌ Modificar permissões de outros usuários
- ❌ Apagar registros de auditoria
- ❌ Bloquear permanentemente um IP sem aprovação humana

---

## Kill Switch

O Agente de Segurança pode ser desativado completamente via painel Master:

**Configuração**: `system_settings.security_auto_action = 'false'`

Quando desativado, o agente **apenas detecta e registra** sem executar nenhuma ação.

---

## Tabela de Auditoria

Todas as ações de segurança são registradas em `audit_logs`:

```
action: "SECURITY_BLOCK_IP" | "SECURITY_INVALIDATE_SESSION" | ...
entity_type: "ip_address" | "session" | ...
entity_id: "192.168.x.x" | "sess_xxx" | ...
new_values: { reason, duration, triggeredBy: "SecurityAgent" }
```

---

## Isolamento do Agente de Segurança

O agente **não tem acesso** a:
- Conteúdo de mensagens de suporte de outros usuários
- Dados financeiros (transações, créditos)
- Configurações de sistema além de `system_settings`
- Qualquer operação de escrita que não seja as explicitamente autorizadas acima
