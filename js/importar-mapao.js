// ============================================================
// js/importar-mapao.js
// Importa o mapão completo e gera prévia de todas as disciplinas
// ============================================================

let professorLogado = null;
let minhasDisciplinas = []; // { turma_id, disciplina_id, turma_nome, disciplina_nome }
let dadosImportados = [];   // { aluno_id, aluno_nome, numero_chamada, disciplinas: { disc_id: { media, faltas } } }
let disciplinasOrdenadas = []; // disciplinas que apareceram no mapão, na ordem das colunas

// ── Inicialização ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await verificarProfessor();

  const input = document.getElementById("inputMapao");
  if (input) input.addEventListener("change", processarArquivo);
});

async function verificarProfessor() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { window.location.href = "index.html"; return; }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "professor") {
    alert("Acesso restrito a professores.");
    window.location.href = "dashboard.html";
    return;
  }

  professorLogado = profile;

  // Carrega as disciplinas vinculadas ao professor
  const { data, error } = await supabaseClient
    .from("professor_disciplina_turma")
    .select(`
      turma_id,
      disciplina_id,
      turmas ( nome, ano ),
      disciplinas ( nome )
    `)
    .eq("professor_id", professorLogado.id);

  if (error) { console.log(error); return; }
  minhasDisciplinas = (data || []).map(d => ({
    turma_id:        d.turma_id,
    disciplina_id:   d.disciplina_id,
    turma_nome:      d.turmas?.nome || "",
    turma_ano:       d.turmas?.ano  || "",
    disciplina_nome: d.disciplinas?.nome || "",
  }));
}

// ── Processamento do arquivo ──────────────────────────────────

async function processarArquivo(event) {
  const file = event.target.files[0];
  if (!file) return;

  const feedback = document.getElementById("feedbackUpload");
  feedback.innerHTML = `<div class="alert alert-info py-2">⏳ Lendo arquivo...</div>`;

  const bimestre = document.getElementById("bimestreSelect").value;

  // Lê o arquivo
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 1. Encontrar linha do cabeçalho ("ALUNO")
  let headerRowIndex = -1;
  for (let i = 0; i < json.length; i++) {
    if (compararTextos(String(json[i][0] ?? ""), "ALUNO")) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    feedback.innerHTML = `<div class="alert alert-danger">Não foi possível encontrar a célula "ALUNO" no arquivo.</div>`;
    event.target.value = "";
    return;
  }

  const headerRow  = json[headerRowIndex];
  const subHeader  = json[headerRowIndex + 1] || [];

  // 2. Para cada disciplina do professor, encontrar a coluna no mapão
  // Busca as disciplinas da turma para usar como referência de nomes
  // Agrupa por turma para evitar buscas repetidas
  const turmasUnicas = [...new Set(minhasDisciplinas.map(d => d.turma_id))];
  const discsPorTurma = {};
  for (const turmaId of turmasUnicas) {
    const { data } = await supabaseClient
      .from("turma_disciplinas")
      .select("disciplinas(id, nome)")
      .eq("turma_id", turmaId);
    discsPorTurma[turmaId] = (data || []).filter(d => d.disciplinas).map(d => d.disciplinas.nome);
  }

  function matchDisciplina(nomeMapao, nomeBanco) {
    const nm = normalizarTexto(nomeMapao);
    const nb = normalizarTexto(nomeBanco);
    return nb.startsWith(nm) || nm.startsWith(nb);
  }

  function encontrarColuna(disciplinaNome, turmaId) {
    // Descobre o nome alvo usando as disciplinas do banco como referência
    const discsRef = discsPorTurma[turmaId] || [];
    let disciplinaAlvo = disciplinaNome;
    const match = discsRef.find(d => matchDisciplina(disciplinaNome, d) || matchDisciplina(d, disciplinaNome));
    if (match) disciplinaAlvo = match;

    // Encontra a coluna com melhor match (ignorando duplicatas de merge)
    let discColIndex = -1;
    let melhorMatch = 0;
    let ultimaCelula = null;

    for (let j = 0; j < headerRow.length; j++) {
      const cellNome = String(headerRow[j] ?? "").split("\n")[0].trim();
      if (cellNome === ultimaCelula) continue;
      ultimaCelula = cellNome;
      if (!cellNome) continue;

      const nm = normalizarTexto(cellNome);
      const nd = normalizarTexto(disciplinaAlvo);
      const prefixo = Math.min(nm.length, nd.length);

      if ((nd.startsWith(nm) || nm.startsWith(nd)) && prefixo > melhorMatch) {
        melhorMatch = prefixo;
        discColIndex = j;
      }
    }

    if (discColIndex === -1) return null;

    // Encontra a coluna M (média) e F (faltas) no subheader
    // Determina o range do merge da disciplina
    let endColIndex = discColIndex;
    if (sheet["!merges"]) {
      const merge = sheet["!merges"].find(m => m.s.r === headerRowIndex && m.s.c === discColIndex);
      if (merge) endColIndex = merge.e.c;
    }

    let mediaCol  = -1;
    let faltasCol = -1;

    for (let c = discColIndex; c <= endColIndex; c++) {
      if (compararTextos(String(subHeader[c] ?? ""), "M") && mediaCol  === -1) mediaCol  = c;
      if (compararTextos(String(subHeader[c] ?? ""), "F") && mediaCol  !== -1 && faltasCol === -1) faltasCol = c;
    }

    if (mediaCol === -1) return null;
    if (faltasCol === -1) faltasCol = mediaCol + 1;

    return { discColIndex, mediaCol, faltasCol };
  }

  // 3. Mapear disciplinas encontradas
  disciplinasOrdenadas = [];
  const mapaDiscs = {}; // disciplina_id → { mediaCol, faltasCol, disciplina_nome }

  for (const disc of minhasDisciplinas) {
    const cols = encontrarColuna(disc.disciplina_nome, disc.turma_id);
    if (cols) {
      mapaDiscs[disc.disciplina_id] = { ...cols, disciplina_nome: disc.disciplina_nome, turma_nome: disc.turma_nome, turma_ano: disc.turma_ano, turma_id: disc.turma_id };
      disciplinasOrdenadas.push(disc.disciplina_id);
    }
  }

  if (disciplinasOrdenadas.length === 0) {
    feedback.innerHTML = `<div class="alert alert-warning">Nenhuma das suas disciplinas foi encontrada neste arquivo. Verifique se o mapão é da sua turma.</div>`;
    event.target.value = "";
    return;
  }

  // 4. Ler alunos da turma no banco (usa a primeira turma encontrada)
  const turmaId = minhasDisciplinas[0].turma_id;
  const { data: alunos } = await supabaseClient
    .from("alunos")
    .select("id, nome, numero_chamada")
    .eq("turma_id", turmaId)
    .order("numero_chamada", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });

  if (!alunos || alunos.length === 0) {
    feedback.innerHTML = `<div class="alert alert-warning">Nenhum aluno encontrado no banco para a turma.</div>`;
    event.target.value = "";
    return;
  }

  // 5. Ler notas do mapão para cada aluno
  dadosImportados = [];

  for (const aluno of alunos) {
    const discNotas = {};

    // Procurar o aluno no Excel comparando nomes
    for (let r = headerRowIndex + 2; r < json.length; r++) {
      const rowData = json[r];
      const nomeExcel = rowData[0];
      if (!nomeExcel || typeof nomeExcel !== "string") continue;
      if (!compararTextos(nomeExcel, aluno.nome)) continue;

      // Aluno encontrado — extrair notas de cada disciplina
      for (const discId of disciplinasOrdenadas) {
        const { mediaCol, faltasCol } = mapaDiscs[discId];
        const rawMedia  = rowData[mediaCol];
        const rawFaltas = rowData[faltasCol];

        const mediaStr  = String(rawMedia  ?? "").trim();
        const faltasStr = String(rawFaltas ?? "").trim();

        // Média: "-" ou vazio → null (professor preenche manualmente)
        const media = (mediaStr === "-" || mediaStr === "") ? null : parseFloat(mediaStr.replace(",", ".")) || null;

        // Faltas: "-" ou vazio → 0 (sem falta registrada)
        const faltasVal = (faltasStr === "-" || faltasStr === "") ? 0 : (parseFloat(faltasStr.replace(",", ".")) || 0);

        discNotas[discId] = { media, faltas: faltasVal };
      }
      break;
    }

    dadosImportados.push({
      aluno_id:       aluno.id,
      aluno_nome:     aluno.nome,
      numero_chamada: aluno.numero_chamada,
      bimestre,
      disciplinas: discNotas,
    });
  }

  // 6. Montar e exibir a prévia
  montarPrevia(mapaDiscs, bimestre, file.name);
  feedback.innerHTML = "";
  event.target.value = "";
}

// ── Prévia ────────────────────────────────────────────────────

function montarPrevia(mapaDiscs, bimestre, nomeArquivo) {
  // Título
  const turmaRef = minhasDisciplinas[0];
  document.getElementById("tituloPrevia").textContent =
    `${turmaRef.turma_nome} - ${turmaRef.turma_ano} • ${bimestre}º Bimestre`;
  document.getElementById("subtituloPrevia").textContent = `Arquivo: ${nomeArquivo}`;

  // Legenda
  const semNota = dadosImportados.reduce((acc, a) => {
    return acc + disciplinasOrdenadas.filter(id => a.disciplinas[id]?.media === null).length;
  }, 0);

  document.getElementById("legendaImportacao").innerHTML = `
    <span>✅ Com nota</span>
    <span class="cell-vazio">— Sem nota (preencher manualmente)</span>
    ${semNota > 0 ? `<span class="text-warning fw-semibold">⚠️ ${semNota} campo(s) sem nota</span>` : ""}
  `;

  // Cabeçalho
  const cabecalho = document.getElementById("cabecalhoPrevia");
  let thDiscs = disciplinasOrdenadas.map(id => {
    const d = mapaDiscs[id];
    return `<th><div>${d.disciplina_nome}</div><div class="badge-disc">M &nbsp; F</div></th>`;
  }).join("");
  cabecalho.innerHTML = `
    <tr>
      <th style="width:40px">#</th>
      <th class="col-aluno-header">Aluno</th>
      ${thDiscs}
    </tr>
  `;

  // Corpo
  const corpo = document.getElementById("corpoPrevia");
  corpo.innerHTML = dadosImportados.map(aluno => {
    const cells = disciplinasOrdenadas.map(id => {
      const n = aluno.disciplinas[id];
      if (!n || n.media === null) {
        return `<td class="cell-vazio">—</td>`;
      }
      return `<td class="cell-ok">${n.media} <span class="text-muted fw-normal">/ ${n.faltas}</span></td>`;
    }).join("");

    return `
      <tr>
        <td class="col-chamada">${aluno.numero_chamada ?? ""}</td>
        <td class="col-aluno">${aluno.aluno_nome}</td>
        ${cells}
      </tr>
    `;
  }).join("");

  // Mostrar prévia
  document.getElementById("areaUpload").style.display = "none";
  document.getElementById("areaPrevia").style.display  = "block";
}

// ── Salvar ────────────────────────────────────────────────────

async function salvarTudo() {
  const btn     = document.getElementById("btnSalvar");
  const texto   = document.getElementById("btnSalvarTexto");
  const spinner = document.getElementById("btnSalvarSpinner");

  btn.disabled = true;
  texto.textContent = "Salvando...";
  spinner.classList.remove("d-none");

  try {
    const registros = [];

    for (const aluno of dadosImportados) {
      for (const discId of disciplinasOrdenadas) {
        const n = aluno.disciplinas[discId];
        if (!n || n.media === null) continue; // pula campos sem nota

        registros.push({
          aluno_id:      aluno.aluno_id,
          disciplina_id: discId,
          bimestre:      parseInt(aluno.bimestre),
          media:         n.media,
          faltas:        n.faltas ?? 0,
        });
      }
    }

    if (registros.length === 0) {
      alert("Nenhuma nota para salvar. Verifique se o mapão possui notas preenchidas.");
      return;
    }

    const { error } = await supabaseClient
      .from("notas_frequencia")
      .upsert(registros, { onConflict: ["aluno_id", "disciplina_id", "bimestre"] });

    if (error) {
      alert("Erro ao salvar: " + error.message);
      console.error(error);
      return;
    }

    alert(`✅ ${registros.length} registros salvos com sucesso!`);
    window.location.href = "dashboard-professor.html";

  } catch (err) {
    alert("Erro inesperado: " + err.message);
  } finally {
    btn.disabled = false;
    texto.textContent = "💾 Salvar Tudo";
    spinner.classList.add("d-none");
  }
}

// ── Voltar ────────────────────────────────────────────────────

function voltarUpload() {
  dadosImportados = [];
  disciplinasOrdenadas = [];
  document.getElementById("areaPrevia").style.display  = "none";
  document.getElementById("areaUpload").style.display  = "block";
  document.getElementById("feedbackUpload").innerHTML  = "";
  document.getElementById("cabecalhoPrevia").innerHTML = "";
  document.getElementById("corpoPrevia").innerHTML     = "";
}
