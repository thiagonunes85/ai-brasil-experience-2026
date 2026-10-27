import fs from 'fs';
import dns from 'dns';
import { execSync } from 'child_process';

// Otimização de rede para evitar latência de IPv6 em runners ou Windows
if (dns && dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// 1. Captura e valida o arquivo SARIF gerado pelo CodeQL
const sarifPath = process.argv[2] || 'sarif-results/javascript.sarif';
if (!fs.existsSync(sarifPath)) {
  console.log("✅ Nenhum arquivo SARIF encontrado. Pipeline limpo!");
  process.exit(0);
}

const sarif = JSON.parse(fs.readFileSync(sarifPath, 'utf8'));
const results = sarif.runs?.[0]?.results || [];

if (results.length === 0) {
  console.log("✅ CodeQL não encontrou vulnerabilidades.");
  process.exit(0);
}

async function callGemini(apiKey, prompt) {
  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ].filter(Boolean);

  let lastError = null;

  for (const model of candidateModels) {
    try {
      console.log(`🤖 Chamando modelo Gemini [${model}]...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️ Modelo ${model} retornou ${response.status}: ${errorText.substring(0, 120)}...`);
        lastError = new Error(`Status ${response.status}: ${errorText}`);
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err) {
      console.warn(`⚠️ Exceção ao chamar ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("Nenhum modelo Gemini respondeu com sucesso.");
}

async function runAgent() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Variável de ambiente GEMINI_API_KEY não foi encontrada.");
  }

  for (const issue of results) {
    const ruleId = issue.ruleId;
    const location = issue.locations?.[0]?.physicalLocation;
    const filePath = location?.artifactLocation?.uri;
    const startLine = location?.region?.startLine || 1;
    const endLine = location?.region?.endLine || startLine;

    console.log(`🔍 Analisando [${ruleId}] em ${filePath}:${startLine}...`);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Arquivo ${filePath} não encontrado no workspace. Pulando...`);
      continue;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    // 2. Prompt de Engenharia (Contexto Limitado e Focado)
    const prompt = `
Você é um Agente Autônomo de DevSecOps especializado em remediação automatizada de código.
Uma ferramenta SAST (CodeQL) detectou uma vulnerabilidade crítica no Pull Request atual:

- Regra Violada: ${ruleId}
- Arquivo Afetado: ${filePath}
- Linhas Afetadas: ${startLine} a ${endLine}

Código completo do arquivo:
\`\`\`typescript
${fileContent}
\`\`\`

SUA TAREFA:
1. Explique em no máximo 2 linhas o risco real desta vulnerabilidade.
2. Forneça o bloco de código refatorado e seguro que deve substituir o trecho vulnerável.
A correção deve utilizar a sintaxe de 'Suggested Changes' do GitHub Markdown:
\`\`\`suggestion
// seu código seguro aqui
\`\`\`
Utilize Prepared Statements / Parameterized Queries ou boas práticas recomendadas para mitigar ${ruleId}.
`;

    // 3. Chamada ao Modelo Gemini com Resiliência Automática
    const { text: agentAnalysis, modelUsed } = await callGemini(apiKey, prompt);
    console.log(`✅ Patch gerado com sucesso via ${modelUsed}!`);

    // 4. Montagem e Envio do Comentário no Pull Request
    const commentBody = `### 🛡️ Agente DevSecOps: Alerta e Remediação Automática
O scanner de segurança detectou uma vulnerabilidade crítica (\`${ruleId}\`) nas linhas **${startLine} a ${endLine}**.
Para manter a cultura *blameless* e acelerar o fluxo de entrega sem atrito, o **Agente Autônomo** preparou um patch seguro:

${agentAnalysis}

---
*Análise gerada autonomamente pelo modelo Google Gemini (\`${modelUsed}\`).*
`;

    fs.writeFileSync('agent_comment.md', commentBody, 'utf8');

    if (process.env.PR_NUMBER) {
      console.log(`📤 Publicando comentário no PR #${process.env.PR_NUMBER}...`);
      try {
        execSync(`gh pr comment ${process.env.PR_NUMBER} --body-file agent_comment.md`, {
          stdio: 'inherit'
        });
        console.log(`✅ Comentário publicado no PR #${process.env.PR_NUMBER}!`);
      } catch (ghErr) {
        console.error("⚠️ Não foi possível publicar via 'gh' CLI:", ghErr.message);
      }
    } else {
      console.log("\n📋 [Simulação Local] Comentário gerado com sucesso em 'agent_comment.md':\n");
      console.log(commentBody);
    }
  }
}

runAgent().catch(err => {
  console.error("❌ Falha na execução do Agente:", err);
  process.exit(1);
});
