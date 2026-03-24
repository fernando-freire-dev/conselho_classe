let usuarioLogado = null;
let conselhoAtual = null;

// Calcula quantos dias se passaram desde a data do conselho.
// Se a data estiver vazia/inválida, retorna um número alto para aplicar bloqueio por segurança.
function calcularDiasDesdeConselho(dataConselho) {
  if (!dataConselho) return 9999;
  const d = new Date(dataConselho);
  if (Number.isNaN(d.getTime())) return 9999;
  const diffMs = Date.now() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Helper: lê jsonb "faz" (novo) ou "tem" (antigo) com default "faz=true"
function lerFaz(jsonb) {
  if (!jsonb || typeof jsonb !== "object") return true; // default: faz
  if (jsonb.faz !== undefined) return !!jsonb.faz;      // novo
  if (jsonb.tem !== undefined) return !jsonb.tem;       // antigo (tem=true => NÃO faz)
  return true;
}

// Cache para o modal de notas
let cacheDisciplinas = [];
let cacheNotasPorAluno = {};
let modalNotasInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  await verificarUsuario();
  await carregarTurmas();

  const t = localStorage.getItem("conselho_turma_id");
  const b = localStorage.getItem("conselho_bimestre");

  if (t) document.getElementById("turmaSelect").value = t;
  if (b) document.getElementById("bimestreSelect").value = b;

  if (t && b) {
    await carregarConselho();
    localStorage.removeItem("conselho_turma_id");
    localStorage.removeItem("conselho_bimestre");
  }

  // Modal de Notas (Bootstrap)
  const modalEl = document.getElementById("modalNotas");
  if (modalEl && window.bootstrap) {
    modalNotasInstance = new bootstrap.Modal(modalEl);
  }

  const btnMarcarTodos = document.getElementById("btnMarcarTodosConcluido");
  if (btnMarcarTodos) {
    btnMarcarTodos.addEventListener("click", marcarTodosComoConcluido);
  }

  // Delegação de eventos da tabela
  const corpo = document.getElementById("corpoTabela");
  if (corpo) {
    corpo.addEventListener("change", (e) => {
      const target = e.target;

      // Checkbox que abre área (dificuldade)
      if (target && target.classList.contains("toggle-area")) {
        const areaId = target.getAttribute("data-target");
        const area = areaId ? document.getElementById(areaId) : null;
        if (area) {
          if (target.checked) {
            area.classList.remove("d-none");
          } else {
            area.classList.add("d-none");
            const txt = area.querySelector("textarea");
            if (txt) txt.value = "";
          }
        }
      }

      // Select "Faz/Não Faz" (sala)
      if (target && target.classList.contains("selFazSala")) {
        const faz = target.value === "true";
        const areaId = target.getAttribute("data-target");
        const area = areaId ? document.getElementById(areaId) : null;
        if (area) {
          if (!faz) {
            area.classList.remove("d-none");
          } else {
            area.classList.add("d-none");
            const txt = area.querySelector("textarea");
            if (txt) txt.value = "";
          }
        }
      }

      // Select "Faz/Não Faz" (plataforma)
      if (target && target.classList.contains("selFazPlataforma")) {
        const faz = target.value === "true";
        const areaId = target.getAttribute("data-target");
        const area = areaId ? document.getElementById(areaId) : null;
        if (area) {
          if (!faz) {
            area.classList.remove("d-none");
          } else {
            area.classList.add("d-none");
            const txt = area.querySelector("textarea");
            if (txt) txt.value = "";
          }
        }
      }

      // Destaque visual da linha quando marcar como concluído
      if (target && target.classList.contains("concluidoSwitch")) {
        const row = target.closest("tr");
        atualizarStatusLinha(row);
        atualizarContadoresTabela();
      }
    });

    // Botão Notas
    corpo.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-notas");
      if (!btn) return;
      const alunoId = btn.getAttribute("data-aluno");
      if (alunoId) abrirModalNotas(alunoId);
    });
  }
});

function atualizarStatusLinha(row) {
  if (!row) return;

  const sw = row.querySelector(".concluidoSwitch");
  const badge = row.querySelector(".status-badge");

  const isOn = !!sw?.checked;
  row.classList.toggle("row-concluido", isOn);

  if (badge) {
    badge.textContent = isOn ? "Concluído" : "Pendente";
    badge.classList.toggle("text-bg-success", isOn);
    badge.classList.toggle("text-bg-secondary", !isOn);
  }
}

function atualizarContadoresTabela() {
  const totalEl = document.getElementById("cntTotal");
  const concluidosEl = document.getElementById("cntConcluidos");
  const pendentesEl = document.getElementById("cntPendentes");

  const linhas = document.querySelectorAll("#corpoTabela tr");
  const total = linhas.length;

  let concluidos = 0;
  linhas.forEach(l => {
    const sw = l.querySelector(".concluidoSwitch");
    if (sw && sw.checked) concluidos += 1;
  });

  const pendentes = Math.max(0, total - concluidos);

  if (totalEl) totalEl.textContent = String(total);
  if (concluidosEl) concluidosEl.textContent = String(concluidos);
  if (pendentesEl) pendentesEl.textContent = String(pendentes);
}

async function marcarTodosComoConcluido() {
  if (!conselhoAtual?.id) {
    alert("Carregue um conselho primeiro.");
    return;
  }

  // Respeita bloqueio
  if (usuarioLogado?.role === "professor") {
    if (conselhoAtual.status === "finalizado") {
      alert("Conselho finalizado. Não é possível editar.");
      return;
    }
    const dias = calcularDiasDesdeConselho(conselhoAtual?.data_conselho);
    if (dias !== null && dias > 5) {
      alert("Prazo para edição encerrado.");
      return;
    }
  }

  const confirmar = confirm("Marcar TODOS os alunos como concluído?");
  if (!confirmar) return;

  const linhas = Array.from(document.querySelectorAll("#corpoTabela tr"));
  if (linhas.length === 0) return;

  // Atualiza UI
  linhas.forEach(l => {
    const sw = l.querySelector(".concluidoSwitch");
    if (sw) sw.checked = true;
    atualizarStatusLinha(l);
  });
  atualizarContadoresTabela();

  // Atualiza banco em lote
  const payload = linhas
    .map(l => l.getAttribute("data-aluno-id"))
    .filter(Boolean)
    .map(alunoId => ({
      conselho_id: conselhoAtual.id,
      aluno_id: alunoId,
      concluido: true,
      updated_by: usuarioLogado?.id ?? null,
    }));

  const { error } = await supabaseClient
    .from("conselho_alunos")
    .upsert(payload, { onConflict: "conselho_id,aluno_id" });

  if (error) {
    console.error(error);
    alert("Erro ao marcar todos como concluído no banco.");
    return;
  }

  alert("Todos os alunos foram marcados como concluído.");
}

async function verificarUsuario() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "professor" && profile.role !== "coordenacao")) {
    alert("Acesso restrito.");
    window.location.href = "dashboard.html";
    return;
  }

  usuarioLogado = profile;
}

// Carregar turmas
async function carregarTurmas() {
  let data = null;
  let error = null;

  if (usuarioLogado.role === "professor") {
    const res = await supabaseClient
      .from("professor_turma")
      .select("turmas(id, nome, ano, ensino)")
      .eq("professor_id", usuarioLogado.id)
      .order("nome", { foreignTable: "turmas", ascending: true });

    data = res.data;
    error = res.error;
  } else {
    const res = await supabaseClient
      .from("turmas")
      .select("id, nome, ano, ensino")
      .order("nome", { ascending: true });

    data = res.data;
    error = res.error;
  }

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("turmaSelect");
  select.innerHTML = "";

  if (usuarioLogado.role === "professor") {
    data.forEach(item => {
      const turma = item.turmas;
      select.innerHTML += `<option value="${turma.id}">${turma.nome}</option>`;
    });
  } else {
    data.forEach(turma => {
      select.innerHTML += `<option value="${turma.id}">${turma.nome}</option>`;
    });
  }
}

// Carregar conselho
async function carregarConselho() {
  if (!window.supabaseClient) {
    alert("Supabase não foi inicializado. Verifique se o script js/supabase.js está sendo carregado.");
    console.error("supabaseClient indefinido. Confira a ordem dos scripts: supabase-js CDN -> js/supabase.js -> js/conselho.js");
    return;
  }

  const turmaId = document.getElementById("turmaSelect").value;
  const bimestre = document.getElementById("bimestreSelect").value;

  const { data, error } = await supabaseClient
    .from("conselhos")
    .select("*")
    .eq("turma_id", turmaId)
    .eq("bimestre", bimestre)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Erro ao buscar conselho:", error);
    alert(`Erro ao buscar conselho: ${error.message}`);
    return;
  }

  if (data) {
    conselhoAtual = data;
  } else {
    const { data: novoConselho, error: errInsert } = await supabaseClient
      .from("conselhos")
      .insert({
        turma_id: turmaId,
        bimestre: bimestre
      })
      .select()
      .single();

    if (errInsert) {
      console.error("Erro ao criar conselho:", errInsert);
      alert(`Erro ao criar conselho: ${errInsert.message}`);
      return;
    }

    conselhoAtual = novoConselho;
  }

  if (!conselhoAtual) {
    alert("Não foi possível carregar/criar o conselho.");
    return;
  }

  document.getElementById("observacoesGerais").value = conselhoAtual.observacoes_gerais || "";

  await montarTabelaAlunos(turmaId, bimestre);
  aplicarBloqueioSeNecessario();
  mostrarConselho();
}

// Monta tabela
async function montarTabelaAlunos(turmaId, bimestre) {
  const headerTop = document.getElementById("headerTop");
  const corpo = document.getElementById("corpoTabela");

  if (!headerTop || !corpo) {
    console.error("IDs do HTML não encontrados. Verifique se existem: headerTop, corpoTabela");
    alert("Erro na tela: cabeçalho/tabela não encontrados. Verifique o HTML do conselho.");
    return;
  }

  corpo.innerHTML = "";

  headerTop.innerHTML = `
    <th class="col-chamada">Nº</th>
    <th>Nome</th>
    <th>Dificuldades</th>
    <th>Atividade em sala</th>
    <th>Plataformas</th>
    <th>Indisciplina</th>
    <th>Proficiência</th>
    <th class="text-center">Notas</th>
    <th class="text-center">Concluído</th>
  `; // [V1.1] Removido Faltoso/Dorme e ajustado cabeçalho


  // Disciplinas da turma (modal boletim)
  const { data: disciplinas, error: errDisciplinas } = await supabaseClient
    .from("turma_disciplinas")
    .select("disciplinas(id, nome)")
    .eq("turma_id", turmaId);

  if (errDisciplinas) {
    console.log(errDisciplinas);
    alert("Erro ao buscar disciplinas da turma.");
    return;
  }

  const disciplinasUnicas = [...new Map(
    (disciplinas || [])
      .filter(d => d.disciplinas)
      .map(d => [d.disciplinas.id, d.disciplinas])
  ).values()];

  cacheDisciplinas = disciplinasUnicas;

  // Alunos - ordenação pela chamada
  const { data: alunos, error: errAlunos } = await supabaseClient
    .from("alunos")
    .select("*")
    .eq("turma_id", turmaId)
    .order("numero_chamada", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });

  if (errAlunos) {
    console.log(errAlunos);
    alert("Erro ao buscar alunos.");
    return;
  }

  const alunosIds = (alunos || []).map(a => a.id);
  const disciplinasIds = (disciplinasUnicas || []).map(d => d.id);

  // Notas/faltas
  let notas = [];
  if (alunosIds.length > 0 && disciplinasIds.length > 0) {
    const { data: notasData, error: errNotas } = await supabaseClient
      .from("notas_frequencia")
      .select("*")
      .eq("bimestre", bimestre)
      .in("aluno_id", alunosIds)
      .in("disciplina_id", disciplinasIds);

    if (errNotas) {
      console.log(errNotas);
      alert("Erro ao buscar notas/faltas do bimestre.");
      return;
    }

    notas = notasData || [];
  }

  cacheNotasPorAluno = {};
  (notas || []).forEach(n => {
    if (!cacheNotasPorAluno[n.aluno_id]) cacheNotasPorAluno[n.aluno_id] = [];
    cacheNotasPorAluno[n.aluno_id].push(n);
  });

  // Dados do conselho já salvos
  const { data: dadosConselho, error: errConselho } = await supabaseClient
    .from("conselho_alunos")
    .select("*")
    .eq("conselho_id", conselhoAtual.id);

  if (errConselho) {
    console.log(errConselho);
    alert("Erro ao buscar dados do conselho.");
    return;
  }

  (alunos || []).forEach(aluno => {
    const dadosAluno = (dadosConselho || []).find(d => d.aluno_id === aluno.id) || {};

    const difAreaId = `dif_${aluno.id}`;
    const salaAreaId = `sala_${aluno.id}`;
    const platAreaId = `plat_${aluno.id}`;

    const indAreaId = `ind_${aluno.id}`; // [V1.1] área da indisciplina

    const difTem = !!(dadosAluno?.dificuldade && typeof dadosAluno.dificuldade === "object" && dadosAluno.dificuldade.tem);
    const difMat = (dadosAluno?.dificuldade && typeof dadosAluno.dificuldade === "object") ? (dadosAluno.dificuldade.materias ?? "") : "";

    // NOVO: faz_atividade_sala / faz_plataforma
    const fazSala = lerFaz(dadosAluno?.faz_atividade_sala);
    const salaMat = (dadosAluno?.faz_atividade_sala && typeof dadosAluno.faz_atividade_sala === "object") ? (dadosAluno.faz_atividade_sala.materias ?? "") : "";

    const fazPlat = lerFaz(dadosAluno?.faz_plataforma);
    const platMat = (dadosAluno?.faz_plataforma && typeof dadosAluno.faz_plataforma === "object") ? (dadosAluno.faz_plataforma.materias ?? "") : "";

    // [V1.1] Indisciplina agora é objeto (jsonb) no padrão: { tem: boolean, descricao: string }
    // Compatível com dados antigos (boolean) caso ainda existam.
    const indRaw = dadosAluno?.indisciplina;
    const indTem = (indRaw && typeof indRaw === "object") ? !!indRaw.tem : !!indRaw;
    const indDesc = (indRaw && typeof indRaw === "object") ? (indRaw.descricao ?? "") : "";

    const linhaHtml = `
      <tr data-aluno-id="${aluno.id}" class="${dadosAluno?.concluido ? "row-concluido" : ""}">
        <td class="col-chamada">${aluno.numero_chamada ?? ""}</td>
        <td class="fw-semibold col-aluno">${aluno.nome}</td>

        <!-- Dificuldades -->
        <td style="min-width: 260px;">
          <div class="form-check">
            <input class="form-check-input toggle-area dificuldadeChk" type="checkbox"
              data-target="${difAreaId}" ${difTem ? "checked" : ""}>
            <label class="form-check-label">Tem dificuldade</label>
          </div>
          <div id="${difAreaId}" class="mt-2 ${difTem ? "" : "d-none"}">
            <textarea class="form-control form-control-sm dificuldadeTxt" rows="2"
              placeholder="Quais matérias?">${difMat}</textarea>
          </div>
        </td>

        <!-- [V1.1] Removido: Faltoso -->

        <!-- Faz atividade em sala? -->
        <td style="min-width: 280px;">
          <div class="small fw-semibold mb-1">Faz atividade em sala de aula?</div>
          <select class="form-select form-select-sm selFazSala" data-target="${salaAreaId}">
            <option value="true" ${fazSala ? "selected" : ""}>Faz</option>
            <option value="false" ${!fazSala ? "selected" : ""}>Não faz</option>
          </select>
          <div id="${salaAreaId}" class="mt-2 ${!fazSala ? "" : "d-none"}">
            <textarea class="form-control form-control-sm salaMateriasTxt" rows="2"
              placeholder="Quais disciplinas?">${salaMat}</textarea>
          </div>
        </td>

        <!-- [V1.1] Removido: Dorme -->

        <!-- Faz plataformas? -->
        <td style="min-width: 300px;">
          <div class="small fw-semibold mb-1">Faz Plataformas?</div>
          <select class="form-select form-select-sm selFazPlataforma" data-target="${platAreaId}">
            <option value="true" ${fazPlat ? "selected" : ""}>Faz</option>
            <option value="false" ${!fazPlat ? "selected" : ""}>Não faz</option>
          </select>
          <div id="${platAreaId}" class="mt-2 ${!fazPlat ? "" : "d-none"}">
            <textarea class="form-control form-control-sm plataformaMateriasTxt" rows="2"
              placeholder="Quais disciplinas?">${platMat}</textarea>
          </div>
        </td>

        <!-- [V1.1] Indisciplina com descrição (abre textarea ao marcar) -->
        <td style="min-width: 260px;">
          <div class="form-check">
            <input class="form-check-input toggle-area indisciplinaChk" type="checkbox"
              data-target="${indAreaId}" ${indTem ? "checked" : ""}>
            <label class="form-check-label">Indisciplina</label>
          </div>
          <div id="${indAreaId}" class="mt-2 ${indTem ? "" : "d-none"}">
            <textarea class="form-control form-control-sm indisciplinaTxt" rows="2"
              placeholder="Descreva a indisciplina (ex.: uso de celular, conversas, desrespeito...)">${indDesc}</textarea>
          </div>
        </td>

        <!-- Proficiência -->
        <td style="min-width: 190px;">
          <select class="form-select form-select-sm proficiencia">
            <option value="">Selecione</option>
            <option value="Abaixo do Básico">Abaixo do Básico</option>
            <option value="Básico">Básico</option>
            <option value="Proficiente">Proficiente</option>
          </select>
        </td>

        <!-- Notas -->
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-outline-primary btn-notas" data-aluno="${aluno.id}">
            Notas
          </button>
        </td>

        <!-- Concluído -->
        <td class="text-center">
          <div class="d-inline-flex align-items-center gap-2">
            <div class="form-check form-switch m-0">
              <input class="form-check-input concluidoSwitch" type="checkbox" ${dadosAluno?.concluido ? "checked" : ""}>
            </div>
            <span class="badge status-badge ${dadosAluno?.concluido ? "text-bg-success" : "text-bg-secondary"}">
              ${dadosAluno?.concluido ? "Concluído" : "Pendente"}
            </span>
          </div>
        </td>
      </tr>
    `;

    corpo.insertAdjacentHTML("beforeend", linhaHtml);

    const row = corpo.querySelector(`tr[data-aluno-id="${aluno.id}"]`);
    const sel = row?.querySelector(".proficiencia");
    if (sel) sel.value = dadosAluno?.nivel_proficiencia ?? "";

    atualizarStatusLinha(row);
  });

  atualizarContadoresTabela();
}

function abrirModalNotas(alunoId) {
  const modalEl = document.getElementById("modalNotas");
  const tituloEl = document.getElementById("modalNotasTitulo");
  const corpoEl = document.getElementById("modalNotasCorpo");

  if (!modalEl || !corpoEl) {
    alert("Modal de notas não encontrado no HTML.");
    return;
  }

  const linha = document.querySelector(`tr[data-aluno-id="${alunoId}"]`);
  const nomeAluno = linha?.querySelector(".col-aluno")?.innerText || linha?.querySelector("td:nth-child(2)")?.innerText || "Aluno";
  if (tituloEl) tituloEl.innerText = `Notas - ${nomeAluno}`;

  const registros = cacheNotasPorAluno[alunoId] || [];
  const mapPorDisc = new Map();
  registros.forEach(r => mapPorDisc.set(r.disciplina_id, r));

  let html = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle">
        <thead class="table-light">
          <tr>
            <th>Disciplina</th>
            <th class="text-center">Média</th>
            <th class="text-center">Faltas</th>
          </tr>
        </thead>
        <tbody>
  `;

  (cacheDisciplinas || []).forEach(d => {
    const r = mapPorDisc.get(d.id);
    html += `
      <tr>
        <td>${d.nome}</td>
        <td class="text-center">${(r?.media ?? "-")}</td>
        <td class="text-center">${(r?.faltas ?? "-")}</td>
      </tr>
    `;
  });

  if ((cacheDisciplinas || []).length === 0 && registros.length > 0) {
    registros.forEach(r => {
      html += `
        <tr>
          <td>${r.disciplina_id}</td>
          <td class="text-center">${(r?.media ?? "-")}</td>
          <td class="text-center">${(r?.faltas ?? "-")}</td>
        </tr>
      `;
    });
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  corpoEl.innerHTML = html;

  if (modalNotasInstance) {
    modalNotasInstance.show();
  } else if (window.bootstrap) {
    modalNotasInstance = new bootstrap.Modal(modalEl);
    modalNotasInstance.show();
  } else {
    alert("Bootstrap JS não carregado. Adicione bootstrap.bundle.min.js para abrir o modal.");
  }
}

async function salvarObservacoesGerais() {
  if (!conselhoAtual) {
    alert("Carregue um conselho primeiro.");
    return;
  }

  const texto = document.getElementById("observacoesGerais").value;

  const { error } = await supabaseClient
    .from("conselhos")
    .update({ observacoes_gerais: texto })
    .eq("id", conselhoAtual.id);

  if (error) {
    alert("Erro ao salvar observações.");
    return;
  }

  alert("Observações salvas!");
}

async function salvarConselho() {
  if (!conselhoAtual) {
    alert("Carregue um conselho primeiro.");
    return;
  }

  // 🔒 Verifica prazo
  const hoje = new Date();
  const dataConselho = new Date(conselhoAtual.data_conselho);
  const diffDias = (hoje - dataConselho) / (1000 * 60 * 60 * 24);

  if (usuarioLogado.role === "professor" && diffDias > 5) {
    alert("Prazo para edição encerrado.");
    return;
  }

  const linhas = document.querySelectorAll("#corpoTabela tr");
  const dadosParaSalvar = [];

  linhas.forEach(linha => {
    const alunoId = linha.getAttribute("data-aluno-id");
    if (!alunoId) return;

    const dificuldade = linha.querySelector(".dificuldadeChk")?.checked || false;
    const dificuldadeMaterias = linha.querySelector(".dificuldadeTxt")?.value?.trim() || "";

    // [V1.1] Removidos: faltoso e dorme (não fazem mais parte do conselho)

    const fazSala = (linha.querySelector(".selFazSala")?.value === "true");
    const salaMaterias = linha.querySelector(".salaMateriasTxt")?.value?.trim() || "";

    const fazPlat = (linha.querySelector(".selFazPlataforma")?.value === "true");
    const platMaterias = linha.querySelector(".plataformaMateriasTxt")?.value?.trim() || "";

    // [V1.1] Indisciplina agora tem descrição
    const indTem = linha.querySelector(".indisciplinaChk")?.checked || false;
    const indDesc = linha.querySelector(".indisciplinaTxt")?.value?.trim() || "";
    const indisciplina = { tem: indTem, descricao: indTem ? indDesc : "" };

    const proficiencia = linha.querySelector(".proficiencia")?.value || null;
    const concluido = linha.querySelector(".concluidoSwitch")?.checked || false;

    dadosParaSalvar.push({
      conselho_id: conselhoAtual.id,
      aluno_id: alunoId,

      dificuldade: { tem: dificuldade, materias: dificuldade ? dificuldadeMaterias : "" },
      // [V1.1] Removidos: faltoso e dorme
      indisciplina,

      // NOVO: agora salva faz=true/false
      faz_atividade_sala: { faz: fazSala, materias: fazSala ? "" : salaMaterias },
      faz_plataforma: { faz: fazPlat, materias: fazPlat ? "" : platMaterias },

      nivel_proficiencia: proficiencia,
      concluido,

      updated_by: usuarioLogado?.id || null
    });
  });

  const { error } = await supabaseClient
    .from("conselho_alunos")
    .upsert(dadosParaSalvar, { onConflict: ["conselho_id", "aluno_id"] });

  if (error) {
    console.log(error);
    alert("Erro ao salvar.");
    return;
  }

  alert("Conselho salvo com sucesso!");
}

// Bloqueio
function aplicarBloqueioSeNecessario() {
  if (!conselhoAtual) return;

  if (usuarioLogado && usuarioLogado.role === "coordenacao") return;
  if (!usuarioLogado || usuarioLogado.role !== "professor") return;

  const hoje = new Date();
  const dataBaseStr = conselhoAtual.data_conselho || conselhoAtual.created_at || null;
  const dataConselho = dataBaseStr ? new Date(dataBaseStr) : null;

  let diffDias = 0;
  if (dataConselho && !isNaN(dataConselho.getTime())) {
    diffDias = (hoje - dataConselho) / (1000 * 60 * 60 * 24);
  } else {
    diffDias = 0;
  }

  const dentroDoPrazo = diffDias <= 5;
  const finalizado = conselhoAtual.status === "finalizado";

  if (!dentroDoPrazo || finalizado) {
    document.querySelectorAll("input, select, textarea").forEach(el => {
      el.disabled = true;
    });

    document.querySelectorAll("button").forEach(btn => {
      const t = (btn.innerText || "").toLowerCase();
      if (t.includes("salvar") || t.includes("finalizar") || t.includes("marcar todos")) {
        btn.disabled = true;
      }
    });

    const alertaAntigo = document.getElementById("alertaBloqueio");
    if (alertaAntigo) alertaAntigo.remove();

    const aviso = document.createElement("div");
    aviso.id = "alertaBloqueio";
    aviso.className = "alert alert-danger mt-3";
    aviso.innerText = finalizado
      ? "Este conselho foi finalizado. Apenas a coordenação pode alterar."
      : "Prazo de edição encerrado. Apenas a coordenação pode editar.";

    document.body.prepend(aviso);
  }
}

async function finalizarConselho() {
  if (!conselhoAtual) {
    alert("Carregue o conselho primeiro.");
    return;
  }

  const turmaId = conselhoAtual.turma_id;
  const bimestre = conselhoAtual.bimestre;

  const { data: alunos, error: errAlunos } = await supabaseClient
    .from("alunos")
    .select("id,nome")
    .eq("turma_id", turmaId)
    .order("numero_chamada", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });

  if (errAlunos) {
    console.log(errAlunos);
    alert("Erro ao buscar alunos da turma.");
    return;
  }

  const { data: disciplinas, error: errDisciplinas } = await supabaseClient
    .from("turma_disciplinas")
    .select("disciplinas(id,nome)")
    .eq("turma_id", turmaId);

  if (errDisciplinas) {
    console.log(errDisciplinas);
    alert("Erro ao buscar disciplinas da turma.");
    return;
  }

  const disciplinasUnicas = [...new Map(
    (disciplinas || [])
      .filter(d => d.disciplinas)
      .map(d => [d.disciplinas.id, d.disciplinas])
  ).values()];

  const alunosIds = (alunos || []).map(a => a.id);
  const disciplinasIds = (disciplinasUnicas || []).map(d => d.id);

  let notas = [];
  if (alunosIds.length > 0 && disciplinasIds.length > 0) {
    const { data: notasData, error: errNotas } = await supabaseClient
      .from("notas_frequencia")
      .select("*")
      .eq("bimestre", bimestre)
      .in("aluno_id", alunosIds)
      .in("disciplina_id", disciplinasIds);

    if (errNotas) {
      console.log(errNotas);
      alert("Erro ao buscar notas do bimestre.");
      return;
    }
    notas = notasData || [];
  }

  const { data: dadosConselho, error: errConselho } = await supabaseClient
    .from("conselho_alunos")
    .select("*")
    .eq("conselho_id", conselhoAtual.id);

  if (errConselho) {
    console.log(errConselho);
    alert("Erro ao buscar dados do conselho.");
    return;
  }

  for (let aluno of alunos) {
    for (let disc of disciplinasUnicas) {
      const nota = notas.find(n => n.aluno_id === aluno.id && n.disciplina_id === disc.id);
      if (!nota || nota.media === null) {
        const nomeAluno = aluno?.nome || aluno.id;
        const nomeDisc = disc?.nome || disc.id;
        alert(`O aluno ${nomeAluno} está sem nota em ${nomeDisc}.`);
        return;
      }
    }

    const dados = (dadosConselho || []).find(d => d.aluno_id === aluno.id);

    if (!dados) {
      alert(`O aluno ${aluno?.nome || aluno.id} ainda não foi avaliado no conselho.`);
      return;
    }

    if (!dados.nivel_proficiencia) {
      alert(`O aluno ${aluno?.nome || aluno.id} está sem nível de proficiência.`);
      return;
    }

    if (!dados.concluido) {
      alert(`O aluno ${aluno?.nome || aluno.id} não está marcado como concluído.`);
      return;
    }
  }

  const confirmar = confirm("Deseja realmente finalizar o conselho? Após isso o professor não poderá mais editar.");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("conselhos")
    .update({ status: "finalizado" })
    .eq("id", conselhoAtual.id);

  if (error) {
    alert("Erro ao finalizar.");
    return;
  }

  alert("Conselho finalizado com sucesso!");
  location.reload();
}

function mostrarConselho() {
  document.getElementById("areaSelecao").style.display = "none";
  document.getElementById("areaConselho").style.display = "block";
}

function voltarSelecao() {
  document.getElementById("areaConselho").style.display = "none";
  document.getElementById("areaSelecao").style.display = "block";
}
