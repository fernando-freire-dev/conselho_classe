// ============================================================
// js/importar-mapao.js
// Importa o mapão completo da sala — todas as disciplinas
// Acesso: professor representante e coordenação
// ============================================================

let usuarioLogado  = null;
let turmaId        = null;
let dadosImportados    = [];
let disciplinasOrdenadas = [];
let mapaDiscsGlobal    = {};

// ── Inicialização ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await verificarUsuario();
  document.getElementById("inputMapao")
    .addEventListener("change", processarArquivo);
});

async function verificarUsuario() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { window.location.href = "index.html"; return; }

  const { data: profile } = await supabaseClient
    .from("profiles").select("*").eq("id", user.id).single();

  if (!profile || !["professor", "coordenacao"].includes(profile.role)) {
    alert("Acesso restrito.");
    window.location.href = "dashboard.html";
    return;
  }

  usuarioLogado = profile;

  if (profile.role === "professor") {
    await configurarProfessor();
  } else {
    await configurarCoordenacao();
  }
}

// Fluxo professor: busca a turma representante automaticamente
async function configurarProfessor() {
  const { data: rep } = await supabaseClient
    .from("professor_turma")
    .select("turma_id, turmas(nome, ano)")
    .eq("professor_id", usuarioLogado.id)
    .single();

  if (!rep) {
    bloquearUpload("Você não é professor representante de nenhuma turma. Fale com o administrador.");
    return;
  }

  turmaId = rep.turma_id;
  document.getElementById("subtituloTurma").textContent =
    `Turma: ${rep.turmas?.nome || ""} - ${rep.turmas?.ano || ""}`;
}

// Fluxo coordenação: exibe um select para escolher a turma
async function configurarCoordenacao() {
  const { data: turmas } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano")
    .order("nome", { ascending: true });

  if (!turmas || turmas.length === 0) {
    bloquearUpload("Nenhuma turma cadastrada no sistema.");
    return;
  }

  // Mostrar select de turma
  const selectContainer = document.getElementById("containerSelectTurma");
  if (selectContainer) {
    selectContainer.innerHTML = `
      <div class="col-md-4">
        <label class="form-label">Turma</label>
        <select id="turmaSelect" class="form-select" onchange="selecionarTurma(this.value)">
          <option value="">Selecione a turma...</option>
          ${turmas.map(t => `<option value="${t.id}">${t.nome} - ${t.ano}</option>`).join("")}
        </select>
      </div>
    `;
    selectContainer.style.display = "block";
  }

  document.getElementById("subtituloTurma").textContent = "Selecione a turma acima para continuar.";
  bloquearUpload("Selecione uma turma para habilitar a importação.");

  aplicarPreSelecaoCoordenacao();
}

function aplicarPreSelecaoCoordenacao() {
  const turmaSalva = localStorage.getItem("mapao_coord_turma_id");
  const bimestreSalvo = localStorage.getItem("mapao_coord_bimestre");

  const turmaSelect = document.getElementById("turmaSelect");
  const bimestreSelect = document.getElementById("bimestreSelect");

  if (turmaSalva && turmaSelect) {
    const existeTurma = [...turmaSelect.options].some(opt => opt.value === turmaSalva);
    if (existeTurma) {
      turmaSelect.value = turmaSalva;
      selecionarTurma(turmaSalva);
    }
  }

  if (bimestreSalvo && bimestreSelect) {
    const existeBimestre = [...bimestreSelect.options].some(opt => opt.value === bimestreSalvo);
    if (existeBimestre) {
      bimestreSelect.value = bimestreSalvo;
    }
  }

  localStorage.removeItem("mapao_coord_turma_id");
  localStorage.removeItem("mapao_coord_bimestre");
}

function selecionarTurma(id) {
  turmaId = id || null;
  const uploadBox = document.querySelector(".upload-box");

  if (!turmaId) {
    bloquearUpload("Selecione uma turma para habilitar a importação.");
    document.getElementById("subtituloTurma").textContent = "Selecione a turma acima para continuar.";
    return;
  }

  // Atualiza subtítulo com a turma escolhida
  const sel = document.getElementById("turmaSelect");
  const nomeTurma = sel.options[sel.selectedIndex].text;
  document.getElementById("subtituloTurma").textContent = `Turma: ${nomeTurma}`;

  // Habilita o upload
  uploadBox.style.pointerEvents = "";
  uploadBox.style.opacity = "";
  document.getElementById("feedbackUpload").innerHTML = "";
}

function bloquearUpload(mensagem) {
  const uploadBox = document.querySelector(".upload-box");
  uploadBox.style.pointerEvents = "none";
  uploadBox.style.opacity = "0.5";
  if (mensagem) {
    document.getElementById("feedbackUpload").innerHTML =
      `<div class="alert alert-warning py-2">${mensagem}</div>`;
  }
}

// ── Processamento do arquivo ──────────────────────────────────

async function processarArquivo(event) {
  if (!turmaId) {
    alert("Selecione uma turma primeiro.");
    event.target.value = "";
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  const feedback = document.getElementById("feedbackUpload");
  feedback.innerHTML = `<div class="alert alert-info py-2">⏳ Lendo arquivo...</div>`;

  const bimestre = document.getElementById("bimestreSelect").value;

  try {
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
      feedback.innerHTML = `<div class="alert alert-danger">Célula "ALUNO" não encontrada. Verifique se é um mapão válido.</div>`;
      event.target.value = "";
      return;
    }

    const headerRow = json[headerRowIndex];
    const subHeader = json[headerRowIndex + 1] || [];

    // 2. Buscar TODAS as disciplinas da turma no banco
    const { data: discsBanco } = await supabaseClient
      .from("turma_disciplinas")
      .select("disciplinas(id, nome, apelido)")
      .eq("turma_id", turmaId);

    const todasDiscs = (discsBanco || [])
      .filter(d => d.disciplinas)
      .map(d => ({
        id:      d.disciplinas.id,
        nome:    d.disciplinas.nome,
        apelido: d.disciplinas.apelido || null,
      }));

    if (todasDiscs.length === 0) {
      feedback.innerHTML = `<div class="alert alert-warning">Nenhuma disciplina cadastrada para essa turma.</div>`;
      event.target.value = "";
      return;
    }

    // 3. Funções de matching (nomes truncados e merges do XLSX.js)
    function matchDisciplina(nomeMapao, nomeBanco) {
      const nm = normalizarTexto(nomeMapao);
      const nb = normalizarTexto(nomeBanco);
      return nb.startsWith(nm) || nm.startsWith(nb);
    }

    function encontrarColunaDisc(disciplinaNome) {
      let discColIndex = -1;
      let melhorMatch  = 0;
      let ultimaCelula = null;

      for (let j = 0; j < headerRow.length; j++) {
        const cellNome = String(headerRow[j] ?? "").split("\n")[0].trim();
        if (cellNome === ultimaCelula) continue;
        ultimaCelula = cellNome;
        if (!cellNome) continue;

        const nm      = normalizarTexto(cellNome);
        const nd      = normalizarTexto(disciplinaNome);
        const prefixo = Math.min(nm.length, nd.length);

        if ((nd.startsWith(nm) || nm.startsWith(nd)) && prefixo > melhorMatch) {
          melhorMatch  = prefixo;
          discColIndex = j;
        }
      }
      if (discColIndex === -1) return null;

      // Range do merge para localizar M e F no subheader
      let endColIndex = discColIndex;
      if (sheet["!merges"]) {
        const merge = sheet["!merges"].find(
          m => m.s.r === headerRowIndex && m.s.c === discColIndex
        );
        if (merge) endColIndex = merge.e.c;
      }

      let mediaCol  = -1;
      let faltasCol = -1;
      for (let c = discColIndex; c <= endColIndex; c++) {
        if (compararTextos(String(subHeader[c] ?? ""), "M") && mediaCol  === -1) mediaCol  = c;
        if (compararTextos(String(subHeader[c] ?? ""), "F") && mediaCol  !== -1 && faltasCol === -1) faltasCol = c;
      }
      if (mediaCol  === -1) return null;
      if (faltasCol === -1) faltasCol = mediaCol + 1;

      return { discColIndex, mediaCol, faltasCol };
    }

    // 4. Mapear todas as disciplinas → colunas do mapão
    disciplinasOrdenadas = [];
    mapaDiscsGlobal = {};

    for (const disc of todasDiscs) {
      const cols = encontrarColunaDisc(disc.nome);
      if (cols) {
        mapaDiscsGlobal[disc.id] = { ...cols, disciplina_nome: disc.nome, disciplina_apelido: disc.apelido };
        disciplinasOrdenadas.push(disc.id);
      }
    }

    // Ordenar pela posição da coluna no mapão
    disciplinasOrdenadas.sort((a, b) =>
      mapaDiscsGlobal[a].discColIndex - mapaDiscsGlobal[b].discColIndex
    );

    if (disciplinasOrdenadas.length === 0) {
      feedback.innerHTML = `<div class="alert alert-warning">Nenhuma disciplina da turma foi encontrada no arquivo. Verifique se o mapão é desta turma.</div>`;
      event.target.value = "";
      return;
    }

    // 5. Buscar alunos da turma no banco
    const { data: alunos } = await supabaseClient
      .from("alunos")
      .select("id, nome, numero_chamada")
      .eq("turma_id", turmaId)
      .order("numero_chamada", { ascending: true, nullsFirst: false })
      .order("nome", { ascending: true });

    if (!alunos || alunos.length === 0) {
      feedback.innerHTML = `<div class="alert alert-warning">Nenhum aluno cadastrado para essa turma.</div>`;
      event.target.value = "";
      return;
    }

    // 6. Ler notas do mapão para cada aluno × cada disciplina
    dadosImportados = [];

    for (const aluno of alunos) {
      const discNotas = {};

      for (let r = headerRowIndex + 2; r < json.length; r++) {
        const rowData   = json[r];
        const nomeExcel = rowData[0];
        if (!nomeExcel || typeof nomeExcel !== "string") continue;
        if (!compararTextos(nomeExcel, aluno.nome)) continue;

        for (const discId of disciplinasOrdenadas) {
          const { mediaCol, faltasCol } = mapaDiscsGlobal[discId];
          const mediaStr  = String(rowData[mediaCol]  ?? "").trim();
          const faltasStr = String(rowData[faltasCol] ?? "").trim();

          const media   = (mediaStr  === "-" || mediaStr  === "") ? null
            : parseFloat(mediaStr.replace(",",  ".")) || null;
          const faltas  = (faltasStr === "-" || faltasStr === "") ? 0
            : (parseFloat(faltasStr.replace(",", ".")) || 0);

          discNotas[discId] = { media, faltas };
        }
        break;
      }

      dadosImportados.push({
        aluno_id:       aluno.id,
        aluno_nome:     aluno.nome,
        numero_chamada: aluno.numero_chamada,
        bimestre,
        disciplinas:    discNotas,
      });
    }

    // 7. Mostrar prévia
    montarPrevia(bimestre, file.name);
    feedback.innerHTML = "";

  } catch (err) {
    console.error(err);
    feedback.innerHTML = `<div class="alert alert-danger">Erro ao processar o arquivo: ${err.message}</div>`;
  }

  event.target.value = "";
}

// ── Prévia ────────────────────────────────────────────────────

function montarPrevia(bimestre, nomeArquivo) {
  const turmaTxt = document.getElementById("subtituloTurma").textContent.replace("Turma: ", "");
  document.getElementById("tituloPrevia").textContent   = `${turmaTxt} • ${bimestre}º Bimestre`;
  document.getElementById("subtituloPrevia").textContent = `Arquivo: ${nomeArquivo}`;

  const totalDiscs  = disciplinasOrdenadas.length;
  const totalAlunos = dadosImportados.length;
  const semNota = dadosImportados.reduce((acc, a) =>
    acc + disciplinasOrdenadas.filter(id => a.disciplinas[id]?.media === null).length, 0
  );
  const comNota = (totalAlunos * totalDiscs) - semNota;

  document.getElementById("legendaImportacao").innerHTML = `
    <span>✅ <strong>${comNota}</strong> notas importadas</span>
    <span class="cell-vazio">— Sem nota (preencher manualmente)</span>
    ${semNota > 0
      ? `<span class="text-warning fw-semibold ms-2">⚠️ ${semNota} média(s) sem nota</span>`
      : `<span class="text-success fw-semibold ms-2">✔️ Todos os alunos com nota</span>`}
  `;

  // Cabeçalho
  const cabecalho = document.getElementById("cabecalhoPrevia");
  const thDiscs   = disciplinasOrdenadas.map(id => {
    const d = mapaDiscsGlobal[id];
    const label = d.disciplina_apelido || d.disciplina_nome;
    const title = d.disciplina_apelido ? `title="${d.disciplina_nome}"` : "";
    return `<th ${title}><div>${label}</div><div class="badge-disc">Média / Faltas</div></th>`;
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
      if (!n || n.media === null) return `<td class="cell-vazio">—</td>`;
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
        if (!n || n.media === null) continue;

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
      alert("Nenhuma nota para salvar. O mapão pode estar sem notas preenchidas.");
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
    window.location.href = usuarioLogado.role === "coordenacao"
      ? "dashboard-coordenacao.html"
      : "dashboard-professor.html";

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
  dadosImportados      = [];
  disciplinasOrdenadas = [];
  mapaDiscsGlobal      = {};
  document.getElementById("areaPrevia").style.display    = "none";
  document.getElementById("areaUpload").style.display    = "block";
  document.getElementById("feedbackUpload").innerHTML    = "";
  document.getElementById("cabecalhoPrevia").innerHTML   = "";
  document.getElementById("corpoPrevia").innerHTML       = "";
}
