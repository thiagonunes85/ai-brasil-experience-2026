# Diretriz do Agente DevSecOps da Equipe

Sempre que for solicitado a implementar uma nova rota, serviço ou integração:
1. **Zero Trust nos Inputs:** Valide todos os payloads de entrada com schema validation.
2. **Gestão de Segredos:** Nenhuma chave, token ou string de conexão pode ser hardcoded.
3. **Verificação Autônoma:** Após alterar qualquer arquivo, execute a suíte de testes de segurança ou análise estática antes de sugerir o commit.
