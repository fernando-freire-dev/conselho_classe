let coordLogada = null;
let turmasCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  await checkCoordenacao();
  await loadTurmasFiltro();
  await loadConselhos();
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

  // join com turmas para exibir nome/ano/ensino
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

  // filtro por ensino via pós-processamento (compatível e simples)
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
  // A tela conselho.html já carrega por seleção.
  // Aqui só “pré-seleciona” para facilitar.
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

function formatarDataBR(isoDate) {
  // isoDate vem tipo "2026-03-01"
  const [y, m, d] = String(isoDate).split("-");
  return `${d}/${m}/${y}`;
}



// =============================
// Relatório do Conselho (PDF)
// =============================
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

  // [V1.1] Margens menores para ganhar espaço (documento impresso)
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 8;
  const marginR = 8;
  const contentW = pageW - marginL - marginR;

  // [V1.1] Busca também observações gerais e data do conselho
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

  // [V1.1] Removidos campos 'faltoso' e 'dorme' do relatório (mudança solicitada)
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

  // Helpers de formatação
  const simNaoFaz = (obj) => {
    // obj: { faz: true/false, materias: "..." }
    if (!obj || typeof obj !== "object") return "Sim"; // default: faz
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

  // [V1.1] Indisciplina agora segue o padrão "Sim/Não + descrição"
  // Aceita compatibilidade com dados antigos boolean (true/false) e com objeto {tem, descricao}
  const indTxt = (obj) => {
    if (!obj) return "Não";
    if (typeof obj === "boolean") return obj ? "Sim" : "Não";
    if (typeof obj !== "object") return "Não";

    const tem = !!obj.tem;
    const desc = (obj.descricao || obj.materias || "").trim(); // fallback defensivo
    if (!tem) return "Não";
    return desc ? `Sim (${desc})` : "Sim";
  };

  // ============================
  // CABEÇALHO
  // ============================
  doc.setFontSize(15);
  doc.text("PEI Manoel Ignácio da Silva", pageW / 2, 10, { align: "center" });

  doc.setFontSize(11);
  doc.text(
    `Relatório do Conselho de Classe - ${conselho.turmas?.nome || "-"} - ${conselho.bimestre}º Bimestre`,
    pageW / 2,
    16.5,
    { align: "center" }
  );

  doc.setFontSize(10);
  const dataConselhoTxt = conselho.data_conselho ? formatarDataBR(conselho.data_conselho) : "-";
  doc.text(`Data do conselho: ${dataConselhoTxt}`, marginL, 23);
  doc.text(`Emissão: ${formatarDataBR(new Date().toISOString().slice(0, 10))}`, pageW - marginR, 23, { align: "right" });

  // ============================
  // [V1.1] OBSERVAÇÕES GERAIS (com borda)
  // ============================
  const obsLabelY = 30;
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

  // posição inicial da tabela (logo após a caixa)
  let startY = boxStartY + boxHeight + 2;
  if (startY < 45) startY = 45;

  // ============================
  // TABELA
  // ============================
  // [V1.1] Colunas ajustadas (sem Faltoso/Dorme) e Indisciplina com descrição
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
      0: { cellWidth: 50 }, // Nome
      1: { cellWidth: 40 }, // Dificuldade
      2: { cellWidth: 32 }, // Sala
      3: { cellWidth: 32 }, // Plataformas
      4: { cellWidth: 47 }, // Indisciplina (pode vir com descrição)
      5: { cellWidth: 25 }, // Proficiência
      6: { cellWidth: 55 }  // Assinatura
    }
  });

  doc.save(`Relatorio_Conselho_${conselho.turmas?.nome || "Turma"}_${conselho.bimestre}Bim.pdf`);
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

//Inicia o conselho pelo perfil da coordenação, caso o professor não consiga abrir
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

  // Verifica se já existe conselho
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

  // Se não existir, cria
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

  // Abre a página do conselho já pré-selecionada
  localStorage.setItem("conselho_turma_id", turmaId);
  localStorage.setItem("conselho_bimestre", String(bimestre));
  window.location.href = "conselho.html";
}

function renderTurmasFiltro() {
  const ensino = document.getElementById("filtroEnsino").value;

  const select = document.getElementById("filtroTurma");
  const turmaSelecionadaAntes = select.value; // tenta manter a seleção

  select.innerHTML = `<option value="">Todas</option>`;

  const turmasFiltradas = ensino
    ? turmasCache.filter(t => (t.ensino || "") === ensino)
    : turmasCache;

  turmasFiltradas.forEach(t => {
    const ensinoTxt = t.ensino ? ` (${t.ensino})` : "";
    select.innerHTML += `<option value="${t.id}">${t.nome} - ${t.ano}${ensinoTxt}</option>`;
  });

  // tenta restaurar seleção anterior se ainda existir
  const aindaExiste = [...select.options].some(o => o.value === turmaSelecionadaAntes);
  if (aindaExiste) select.value = turmaSelecionadaAntes;
}

function onEnsinoChange() {
  // ao trocar ensino, reseta turma para evitar inconsistência
  document.getElementById("filtroTurma").value = "";
  renderTurmasFiltro();
  loadConselhos();
}