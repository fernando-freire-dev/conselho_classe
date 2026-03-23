let coordLogada = null;
let turmasCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  await checkCoordenacao();
  await loadTurmasFiltro();
  await loadConselhos();
  popularFiltroTurmaNotasFaltas();
});

async function checkCoordenacao() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, nome, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    alert("Não foi possível carregar seu perfil.");
    window.location.href = "index.html";
    return;
  }

  if (profile.role !== "coordenacao" && profile.role !== "admin") {
    alert("Acesso restrito à coordenação.");
    window.location.href = "dashboard.html";
    return;
  }

  coordLogada = profile;
}

async function loadTurmasFiltro() {
  const { data, error } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano, ensino")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  turmasCache = data || [];
  renderTurmasFiltro();
}

async function loadConselhos() {
  const ensino = document.getElementById("filtroEnsino").value;
  const turmaId = document.getElementById("filtroTurma").value;
  const bimestre = document.getElementById("filtroBimestre").value;
  const status = document.getElementById("filtroStatus").value;

  let query = supabaseClient
    .from("conselhos")
    .select(`
      id,
      turma_id,
      bimestre,
      data_conselho,
      status,
      turmas ( nome, ano, ensino )
    `)
    .order("data_conselho", { ascending: false });

  if (turmaId) query = query.eq("turma_id", turmaId);
  if (bimestre) query = query.eq("bimestre", bimestre);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    console.log(error);
    return;
  }

  const filtrado = ensino
    ? data.filter(c => (c.turmas?.ensino || "") === ensino)
    : data;

  const tbody = document.getElementById("listaConselhos");
  tbody.innerHTML = "";

  if (!filtrado || filtrado.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Nenhum conselho encontrado.</td></tr>`;
    return;
  }

  filtrado.forEach(c => {
    const turmaNome = c.turmas ? `${c.turmas.nome} - ${c.turmas.ano}` : "Turma";
    const ensinoTxt = c.turmas?.ensino || "-";
    const dataTxt = c.data_conselho ? formatarDataBR(c.data_conselho) : "-";
    const statusTxt = c.status || "-";

    tbody.innerHTML += `
      <tr>
        <td>${turmaNome}</td>
        <td>${ensinoTxt}</td>
        <td>${c.bimestre}</td>
        <td>${dataTxt}</td>
        <td>${statusTxt}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="abrirConselho('${c.turma_id}', '${c.bimestre}')">
            Abrir
          </button>

          <button class="btn btn-sm btn-outline-secondary" onclick="baixarRelatorio('${c.id}')" ${statusTxt !== "finalizado" ? "disabled" : ""}>
            PDF
          </button>

          <button class="btn btn-sm btn-success" onclick="reabrirConselho('${c.id}')" ${statusTxt !== "finalizado" ? "disabled" : ""}>
            Reabrir
          </button>

          <button class="btn btn-sm btn-danger" onclick="excluirConselho('${c.id}')">
            Excluir
          </button>
        </td>
      </tr>
    `;
  });
}

function abrirConselho(turmaId, bimestre) {
  localStorage.setItem("conselho_turma_id", turmaId);
  localStorage.setItem("conselho_bimestre", String(bimestre));
  window.location.href = "conselho.html";
}

async function reabrirConselho(conselhoId) {
  const confirmar = confirm("Deseja reabrir este conselho? Ele volta para 'em_andamento'.");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("conselhos")
    .update({ status: "em_andamento" })
    .eq("id", conselhoId);

  if (error) {
    alert("Erro ao reabrir.");
    console.log(error);
    return;
  }

  alert("Conselho reaberto!");
  loadConselhos();
}

async function excluirConselho(conselhoId) {
  const confirmar = confirm(
    "ATENÇÃO: excluir é permanente e remove os registros do conselho.\n\nDeseja continuar?"
  );
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("conselhos")
    .delete()
    .eq("id", conselhoId);

  if (error) {
    alert("Erro ao excluir.");
    console.log(error);
    return;
  }

  alert("Conselho excluído com sucesso!");
  loadConselhos();
}

function formatarDataBR(data) {
  const d = new Date(data);

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();

  return `${dia}/${mes}/${ano}`;
}

// =============================
// Relatório do Conselho (PDF)
// =============================
async function baixarRelatorio(conselhoId) {
  if (!window.jspdf || !window.jspdf?.jsPDF || !window.jspdf?.jsPDF) {
    alert("jsPDF não carregou. Verifique os scripts do jsPDF e autoTable no HTML.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 8;
  const marginR = 8;
  const contentW = pageW - marginL - marginR;

  const { data: conselho, error: errConselho } = await supabaseClient
    .from("conselhos")
    .select("id, bimestre, turma_id, observacoes_gerais, data_conselho, turmas(nome)")
    .eq("id", conselhoId)
    .single();

  if (errConselho || !conselho) {
    console.error("Erro conselho:", errConselho);
    alert("Erro ao buscar dados do conselho.");
    return;
  }

  const { data: registros, error: errRegistros } = await supabaseClient
    .from("conselho_alunos")
    .select(`
      conselho_id,
      aluno_id,
      dificuldade,
      faz_atividade_sala,
      faz_plataforma,
      indisciplina,
      nivel_proficiencia,
      concluido,
      alunos ( nome )
    `)
    .eq("conselho_id", conselhoId)
    .order("nome", { foreignTable: "alunos", ascending: true });

  if (errRegistros) {
    console.error("Erro conselho_alunos:", errRegistros);
    alert("Erro ao buscar registros do conselho (conselho_alunos).");
    return;
  }

  const simNaoFaz = (obj) => {
    if (!obj || typeof obj !== "object") return "Sim";
    const faz = obj.faz !== undefined ? !!obj.faz : true;
    const materias = (obj.materias || "").trim();
    if (faz) return "Sim";
    return materias ? `Não (${materias})` : "Não";
  };

  const difTxt = (obj) => {
    if (!obj || typeof obj !== "object") return "Não";
    const tem = !!obj.tem;
    const materias = (obj.materias || "").trim();
    if (!tem) return "Não";
    return materias ? `Sim (${materias})` : "Sim";
  };

  const indTxt = (obj) => {
    if (!obj) return "Não";
    if (typeof obj === "boolean") return obj ? "Sim" : "Não";
    if (typeof obj !== "object") return "Não";

    const tem = !!obj.tem;
    const desc = (obj.descricao || obj.materias || "").trim();
    if (!tem) return "Não";
    return desc ? `Sim (${desc})` : "Sim";
  };

  const turmaTxt = conselho.turmas
    ? `${conselho.turmas.nome} - ${conselho.turmas.ano || ""}`.trim()
    : "Turma";

  const titulo = "PEI Manoel Ignácio da Silva";
  const subtitulo = `Relatório do Conselho de Classe • ${turmaTxt} • ${conselho.bimestre}º Bimestre`;
  const dataConselhoTxt = conselho.data_conselho ? formatarDataBR(conselho.data_conselho) : "-";
  const dataEmissaoTxt = formatarDataBR(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(titulo, pageW / 2, 10, { align: "center" });

  doc.setFontSize(11);
  doc.text(subtitulo, pageW / 2, 16.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Data do conselho: ${dataConselhoTxt}`, marginL, 23);
  doc.text(`Emissão: ${dataEmissaoTxt}`, pageW - marginR, 23, { align: "right" });

  doc.setFontSize(10);
  doc.text("Professor representante: ____________________________________________", marginL, 29);
  doc.text("Reunião com responsáveis (data): ____/____/______", pageW - marginR, 29, { align: "right" });

  const obsLabelY = 35;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Observações gerais da turma:", marginL, obsLabelY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const obs = (conselho.observacoes_gerais || "").trim() || "—";
  const boxPadding = 3;
  const boxStartY = obsLabelY + 2;
  const textStartY = obsLabelY + 6;

  const obsLines = doc.splitTextToSize(obs, contentW - (boxPadding * 2));
  const lineHeight = 4.5;
  const boxHeight = (obsLines.length * lineHeight) + (boxPadding * 2);

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(marginL, boxStartY, contentW, boxHeight);

  doc.text(obsLines, marginL + boxPadding, textStartY + boxPadding);

  let startY = boxStartY + boxHeight + 2;
  if (startY < 45) startY = 45;

  const colunas = [
    "Nome",
    "Dificuldade",
    "Faz atividade em sala?",
    "Faz plataformas?",
    "Indisciplina",
    "Proficiência",
    "Assinatura do responsável"
  ];

  const linhas = (registros || []).map(r => ([
    r.alunos?.nome || "",
    difTxt(r.dificuldade),
    simNaoFaz(r.faz_atividade_sala),
    simNaoFaz(r.faz_plataforma),
    indTxt(r.indisciplina),
    r.nivel_proficiencia || "-",
    ""
  ]));

  doc.autoTable({
    head: [colunas],
    body: linhas,
    startY,
    theme: "grid",
    margin: { left: marginL, right: marginR },
    styles: { fontSize: 9, cellPadding: 2, valign: "middle" },
    headStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 40 },
      2: { cellWidth: 32 },
      3: { cellWidth: 32 },
      4: { cellWidth: 47 },
      5: { cellWidth: 25 },
      6: { cellWidth: 55 }
    }
  });

  doc.save(`Relatorio_Conselho_${conselho.turmas?.nome || "Turma"}_${conselho.bimestre}Bim.pdf`);
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// Inicia o conselho pelo perfil da coordenação
async function iniciarConselho() {
  const turmaId = document.getElementById("filtroTurma").value;
  const bimestre = document.getElementById("filtroBimestre").value;

  if (!turmaId) {
    alert("Selecione uma turma para iniciar o conselho.");
    return;
  }
  if (!bimestre) {
    alert("Selecione um bimestre para iniciar o conselho.");
    return;
  }

  const { data: existente, error: errBusca } = await supabaseClient
    .from("conselhos")
    .select("id")
    .eq("turma_id", turmaId)
    .eq("bimestre", bimestre)
    .maybeSingle();

  if (errBusca) {
    console.log(errBusca);
    alert("Erro ao verificar conselho.");
    return;
  }

  if (!existente) {
    const { error: errCria } = await supabaseClient
      .from("conselhos")
      .insert({ turma_id: turmaId, bimestre: parseInt(bimestre, 10) });

    if (errCria) {
      console.log(errCria);
      alert("Erro ao iniciar conselho (criar).");
      return;
    }
  }

  localStorage.setItem("conselho_turma_id", turmaId);
  localStorage.setItem("conselho_bimestre", String(bimestre));
  window.location.href = "conselho.html";
}

function renderTurmasFiltro() {
  const ensino = document.getElementById("filtroEnsino").value;

  const select = document.getElementById("filtroTurma");
  const turmaSelecionadaAntes = select.value;

  select.innerHTML = `<option value="">Todas</option>`;

  const turmasFiltradas = ensino
    ? turmasCache.filter(t => (t.ensino || "") === ensino)
    : turmasCache;

  turmasFiltradas.forEach(t => {
    const ensinoTxt = t.ensino ? ` (${t.ensino})` : "";
    select.innerHTML += `<option value="${t.id}">${t.nome} - ${t.ano}${ensinoTxt}</option>`;
  });

  const aindaExiste = [...select.options].some(o => o.value === turmaSelecionadaAntes);
  if (aindaExiste) select.value = turmaSelecionadaAntes;
}

function onEnsinoChange() {
  document.getElementById("filtroTurma").value = "";
  renderTurmasFiltro();
  loadConselhos();
}

// =====================================================
// NOVA ABA: ALUNOS
// =====================================================
function onAbaAlunos() {
  popularFiltroTurmaAlunos();
}

function popularFiltroTurmaAlunos() {
  const select = document.getElementById("filtroTurmaAlunos");
  if (!select) return;

  const valorAtual = select.value;
  select.innerHTML = `<option value="">Selecione uma turma</option>`;

  turmasCache.forEach(t => {
    select.innerHTML += `<option value="${t.id}">${t.nome} - ${t.ano}</option>`;
  });

  if ([...select.options].some(o => o.value === valorAtual)) {
    select.value = valorAtual;
  }
}

// =====================================================
// NOVA ABA: NOTAS E FALTAS
// =====================================================
function onAbaNotasFaltas() {
  popularFiltroTurmaNotasFaltas();
}

function popularFiltroTurmaNotasFaltas() {
  const select = document.getElementById("filtroTurmaNotasFaltas");
  if (!select) return;

  const valorAtual = select.value;
  select.innerHTML = `<option value="">Selecione uma turma</option>`;

  turmasCache.forEach(t => {
    select.innerHTML += `<option value="${t.id}">${t.nome} - ${t.ano}</option>`;
  });

  if ([...select.options].some(o => o.value === valorAtual)) {
    select.value = valorAtual;
  }
}

function abrirImportacaoMapaoCoordenacao() {
  const turmaId = document.getElementById("filtroTurmaNotasFaltas")?.value || "";
  const bimestre = document.getElementById("filtroBimestreNotasFaltas")?.value || "";

  if (!turmaId) {
    alert("Selecione uma turma antes de subir o mapão.");
    return;
  }

  if (!bimestre) {
    alert("Selecione um bimestre antes de subir o mapão.");
    return;
  }

  localStorage.setItem("mapao_coord_turma_id", turmaId);
  localStorage.setItem("mapao_coord_bimestre", bimestre);

  window.location.href = "importar-mapao.html";
}

async function visualizarNotasFaltasCoordenacao() {
  const turmaId = document.getElementById("filtroTurmaNotasFaltas")?.value;
  const bimestre = document.getElementById("filtroBimestreNotasFaltas")?.value;
  const preview = document.getElementById("previewNotasFaltasCoordenacao");

  if (!turmaId) {
    alert("Selecione uma turma.");
    return;
  }

  if (!bimestre) {
    alert("Selecione um bimestre.");
    return;
  }

  preview.innerHTML = `
    <div class="alert alert-info py-2 mb-0">
      Carregando notas e faltas...
    </div>
  `;

  try {
    const { data: turmaInfo } = await supabaseClient
      .from("turmas")
      .select("id, nome, ano")
      .eq("id", turmaId)
      .single();

    const { data: disciplinasRel, error: errDisciplinas } = await supabaseClient
      .from("turma_disciplinas")
      .select("disciplinas(id, nome, apelido)")
      .eq("turma_id", turmaId);

    if (errDisciplinas) {
      console.error(errDisciplinas);
      preview.innerHTML = `<div class="alert alert-danger mb-0">Erro ao carregar disciplinas da turma.</div>`;
      return;
    }

    const disciplinas = (disciplinasRel || [])
      .filter(item => item.disciplinas)
      .map(item => ({
        id:      item.disciplinas.id,
        nome:    item.disciplinas.nome,
        apelido: item.disciplinas.apelido || null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const { data: alunos, error: errAlunos } = await supabaseClient
      .from("alunos")
      .select("id, nome, numero_chamada")
      .eq("turma_id", turmaId)
      .order("numero_chamada", { ascending: true, nullsFirst: false })
      .order("nome", { ascending: true });

    if (errAlunos) {
      console.error(errAlunos);
      preview.innerHTML = `<div class="alert alert-danger mb-0">Erro ao carregar alunos da turma.</div>`;
      return;
    }

    const { data: notas, error: errNotas } = await supabaseClient
      .from("notas_frequencia")
      .select("aluno_id, disciplina_id, bimestre, media, faltas")
      .eq("bimestre", parseInt(bimestre, 10))
      .in("aluno_id", (alunos || []).map(a => a.id));

    if (errNotas) {
      console.error(errNotas);
      preview.innerHTML = `<div class="alert alert-danger mb-0">Erro ao carregar notas e faltas.</div>`;
      return;
    }

    renderPreviewNotasFaltasCoordenacao({
      turmaInfo,
      bimestre,
      alunos: alunos || [],
      disciplinas,
      notas: notas || []
    });

  } catch (err) {
    console.error(err);
    preview.innerHTML = `<div class="alert alert-danger mb-0">Erro inesperado ao montar a prévia.</div>`;
  }
}

function renderPreviewNotasFaltasCoordenacao({ turmaInfo, bimestre, alunos, disciplinas, notas }) {
  const preview = document.getElementById("previewNotasFaltasCoordenacao");

  if (!alunos || alunos.length === 0) {
    preview.innerHTML = `
      <div class="alert alert-warning mb-0">
        Nenhum aluno encontrado para a turma selecionada.
      </div>
    `;
    return;
  }

  if (!disciplinas || disciplinas.length === 0) {
    preview.innerHTML = `
      <div class="alert alert-warning mb-0">
        Nenhuma disciplina vinculada a essa turma.
      </div>
    `;
    return;
  }

  const mapaNotas = {};
  (notas || []).forEach(n => {
    mapaNotas[`${n.aluno_id}_${n.disciplina_id}`] = n;
  });

  let totalEsperado = alunos.length * disciplinas.length;
  let totalComNota = 0;

  const thDisciplinas = disciplinas.map(d => {
    const label = d.apelido || d.nome;
    const title = d.apelido ? `title="${d.nome}"` : "";
    return `
      <th ${title}>
        <div>${label}</div>
        <div class="small text-muted">Média / Faltas</div>
      </th>
    `;
  }).join("");

  const linhas = alunos.map(aluno => {
    const tds = disciplinas.map(disc => {
      const registro = mapaNotas[`${aluno.id}_${disc.id}`];

      if (!registro || registro.media === null || registro.media === undefined) {
        return `<td class="text-center text-muted">—</td>`;
      }

      totalComNota++;
      return `<td class="text-center"><strong>${registro.media}</strong> <span class="text-muted">/ ${registro.faltas ?? 0}</span></td>`;
    }).join("");

    return `
      <tr>
        <td class="text-center">${aluno.numero_chamada ?? ""}</td>
        <td>${aluno.nome}</td>
        ${tds}
      </tr>
    `;
  }).join("");

  const totalSemNota = totalEsperado - totalComNota;
  const nomeTurma = turmaInfo ? `${turmaInfo.nome} - ${turmaInfo.ano}` : "Turma";

  preview.innerHTML = `
    <div class="border rounded p-3 bg-light-subtle mb-3">
      <div class="fw-semibold">${nomeTurma} • ${bimestre}º Bimestre</div>
      <div class="small text-muted mt-1">
        ✅ ${totalComNota} notas carregadas &nbsp;&nbsp;|&nbsp;&nbsp;
        ⚠️ ${totalSemNota} sem nota
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-bordered table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th style="width:50px;">#</th>
            <th style="min-width:220px;">Aluno</th>
            ${thDisciplinas}
          </tr>
        </thead>
        <tbody>
          ${linhas}
        </tbody>
      </table>
    </div>
  `;
}
