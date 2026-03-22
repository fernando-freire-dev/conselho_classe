// ============================================================
// js/modals.js — Carrega modals.html e gerencia modais globais
// Incluir em todos os HTMLs APÓS o bootstrap.bundle.min.js
// e APÓS js/supabase.js.
// ============================================================

(async function carregarModais() {
  try {
    const resp = await fetch("modals.html");
    if (!resp.ok) throw new Error("modals.html não encontrado");
    const html = await resp.text();

    const container = document.createElement("div");
    container.id = "globalModals";
    container.innerHTML = html;
    document.body.appendChild(container);
  } catch (err) {
    console.warn("modals.js: não foi possível carregar modals.html →", err.message);
  }
})();


// ── Modal: Alterar Senha ─────────────────────────────────────

let modalSenhaInstance = null;

function abrirModalSenha() {
  // Garante que o modal já foi injetado no DOM
  const modalEl = document.getElementById("modalAlterarSenha");
  if (!modalEl) {
    console.warn("Modal de senha ainda não foi carregado no DOM.");
    return;
  }

  document.getElementById("senhaAtual").value        = "";
  document.getElementById("senhaNova").value         = "";
  document.getElementById("senhaNovaConfirm").value  = "";
  document.getElementById("feedbackSenha").innerHTML = "";

  if (!modalSenhaInstance) {
    modalSenhaInstance = new bootstrap.Modal(modalEl);
  }
  modalSenhaInstance.show();
}

function toggleSenhaModal(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = input.type === "password" ? "text" : "password";
}

async function salvarNovaSenha() {
  const senhaAtual   = document.getElementById("senhaAtual").value;
  const senhaNova    = document.getElementById("senhaNova").value;
  const senhaConfirm = document.getElementById("senhaNovaConfirm").value;
  const feedback     = document.getElementById("feedbackSenha");
  const btn          = document.getElementById("btnSalvarSenha");
  const btnTexto     = document.getElementById("btnSalvarSenhaTexto");
  const spinner      = document.getElementById("btnSalvarSenhaSpinner");

  feedback.innerHTML = "";

  if (!senhaAtual || !senhaNova || !senhaConfirm) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">Preencha todos os campos.</div>`;
    return;
  }

  if (senhaNova.length < 6) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">A nova senha precisa ter no mínimo 6 caracteres.</div>`;
    return;
  }

  if (senhaNova !== senhaConfirm) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">A confirmação de senha não confere.</div>`;
    return;
  }

  btn.disabled = true;
  btnTexto.textContent = "Salvando...";
  spinner.classList.remove("d-none");

  try {
    // Reautentica com a senha atual para garantir que é o próprio usuário
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error: reAuthErr } = await supabaseClient.auth.signInWithPassword({
      email: user.email,
      password: senhaAtual,
    });

    if (reAuthErr) {
      feedback.innerHTML = `<div class="alert alert-danger py-2">Senha atual incorreta.</div>`;
      return;
    }

    // Atualiza para a nova senha
    const { error: updateErr } = await supabaseClient.auth.updateUser({
      password: senhaNova,
    });

    if (updateErr) {
      feedback.innerHTML = `<div class="alert alert-danger py-2">Erro ao atualizar senha: ${updateErr.message}</div>`;
      return;
    }

    feedback.innerHTML = `<div class="alert alert-success py-2">Senha alterada com sucesso!</div>`;

    setTimeout(() => {
      modalSenhaInstance?.hide();
    }, 1500);

  } catch (err) {
    feedback.innerHTML = `<div class="alert alert-danger py-2">Erro inesperado: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnTexto.textContent = "Salvar";
    spinner.classList.add("d-none");
  }
}

// ── Adicione funções de novos modais globais abaixo desta linha ──


// ── Gestão de Alunos (Dashboard Coordenação) ─────────────────

let todosAlunos = [];
let turmasParaAlunos = [];
let modalNovoAlunoInstance = null;

// Carrega turmas no select da aba e no modal
async function carregarTurmasAlunos() {
  const { data, error } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano")
    .order("nome", { ascending: true });

  if (error) { console.log(error); return; }

  turmasParaAlunos = data || [];

  // Select da aba
  const filtro = document.getElementById("filtroTurmaAlunos");
  if (filtro) {
    filtro.innerHTML = `<option value="">Selecione uma turma</option>`;
    turmasParaAlunos.forEach(t => {
      filtro.innerHTML += `<option value="${t.id}">${t.nome} - ${t.ano}</option>`;
    });
  }
}

// Popula o select de turma dentro do modal
function popularTurmasNoModal() {
  const select = document.getElementById("novoAlunoTurma");
  if (!select || turmasParaAlunos.length === 0) return;
  select.innerHTML = `<option value="">Selecione a turma...</option>`;
  turmasParaAlunos.forEach(t => {
    select.innerHTML += `<option value="${t.id}">${t.nome} - ${t.ano}</option>`;
  });

  // Se já há uma turma selecionada na aba, pré-seleciona no modal
  const filtro = document.getElementById("filtroTurmaAlunos");
  if (filtro?.value) select.value = filtro.value;
}

// Carrega alunos da turma selecionada
async function loadAlunos() {
  const turmaId = document.getElementById("filtroTurmaAlunos")?.value;
  const lista = document.getElementById("listaAlunos");

  if (!turmaId) {
    if (lista) lista.innerHTML = `<p class="text-muted">Selecione uma turma para ver os alunos.</p>`;
    todosAlunos = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("alunos")
    .select("id, nome, numero_chamada")
    .eq("turma_id", turmaId)
    .order("numero_chamada", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });

  if (error) { console.log(error); return; }

  todosAlunos = data || [];
  renderAlunos();
}

// Renderiza lista com busca
function renderAlunos() {
  const lista = document.getElementById("listaAlunos");
  if (!lista) return;

  const termo = (document.getElementById("buscaAluno")?.value || "").toLowerCase().trim();

  let filtrados = todosAlunos;
  if (termo) {
    filtrados = filtrados.filter(a =>
      a.nome?.toLowerCase().includes(termo) ||
      String(a.id).includes(termo)
    );
  }

  if (filtrados.length === 0) {
    lista.innerHTML = `<p class="text-muted">Nenhum aluno encontrado.</p>`;
    return;
  }

  lista.innerHTML = `
    <table class="table table-bordered align-middle">
      <thead class="table-light">
        <tr>
          <th style="width:60px">Nº</th>
          <th>Nome</th>
          <th style="width:130px">RA</th>
          <th style="width:80px" class="text-center">Ação</th>
        </tr>
      </thead>
      <tbody>
        ${filtrados.map(a => `
          <tr>
            <td>${a.numero_chamada ?? "-"}</td>
            <td>${a.nome}</td>
            <td>${a.id}</td>
            <td class="text-center">
              <button class="btn btn-sm btn-outline-danger"
                onclick="confirmarRemoverAluno('${a.id}', '${a.nome.replace(/'/g, "\\'")}')">
                Remover
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Abre o modal de novo aluno
function abrirModalNovoAluno() {
  popularTurmasNoModal();

  document.getElementById("novoAlunoNumeroChamada").value = "";
  document.getElementById("novoAlunoNome").value = "";
  document.getElementById("novoAlunoRA").value = "";
  document.getElementById("feedbackNovoAluno").innerHTML = "";

  if (!modalNovoAlunoInstance) {
    modalNovoAlunoInstance = new bootstrap.Modal(document.getElementById("modalNovoAluno"));
  }
  modalNovoAlunoInstance.show();
}

// Salva novo aluno
async function salvarNovoAluno() {
  const turmaId       = document.getElementById("novoAlunoTurma").value;
  const numeroChamada = document.getElementById("novoAlunoNumeroChamada").value.trim();
  const nome          = document.getElementById("novoAlunoNome").value.trim();
  const ra            = document.getElementById("novoAlunoRA").value.trim();

  const feedback = document.getElementById("feedbackNovoAluno");
  const btn      = document.getElementById("btnSalvarNovoAluno");
  const btnTexto = document.getElementById("btnSalvarNovoAlunoTexto");
  const spinner  = document.getElementById("btnSalvarNovoAlunoSpinner");

  feedback.innerHTML = "";

  if (!turmaId || !nome || !ra) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">Preencha turma, nome e RA.</div>`;
    return;
  }

  btn.disabled = true;
  btnTexto.textContent = "Salvando...";
  spinner.classList.remove("d-none");

  try {
    // Verifica se RA já existe
    const { data: existente } = await supabaseClient
      .from("alunos")
      .select("id")
      .eq("id", ra)
      .maybeSingle();

    if (existente) {
      feedback.innerHTML = `<div class="alert alert-danger py-2">Já existe um aluno com o RA <strong>${ra}</strong>.</div>`;
      return;
    }

    const { error } = await supabaseClient
      .from("alunos")
      .insert([{
        id: ra,
        nome,
        turma_id: turmaId,
        numero_chamada: numeroChamada ? parseInt(numeroChamada) : null,
        foto_url: null,
      }]);

    if (error) {
      feedback.innerHTML = `<div class="alert alert-danger py-2">Erro ao salvar: ${error.message}</div>`;
      return;
    }

    feedback.innerHTML = `<div class="alert alert-success py-2">Aluno <strong>${nome}</strong> adicionado com sucesso!</div>`;

    // Atualiza a lista se a turma do modal for a mesma do filtro
    const filtroTurma = document.getElementById("filtroTurmaAlunos");
    if (filtroTurma && (!filtroTurma.value || filtroTurma.value === turmaId)) {
      filtroTurma.value = turmaId;
      await loadAlunos();
    }

    setTimeout(() => modalNovoAlunoInstance?.hide(), 1500);

  } catch (err) {
    feedback.innerHTML = `<div class="alert alert-danger py-2">Erro inesperado: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnTexto.textContent = "Salvar";
    spinner.classList.add("d-none");
  }
}

// Confirma e remove aluno
async function confirmarRemoverAluno(alunoId, nome) {
  const confirmar = confirm(
    `Deseja remover o aluno "${nome}" (RA: ${alunoId})?\n\nEssa ação é permanente.`
  );
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("alunos")
    .delete()
    .eq("id", alunoId);

  if (error) {
    alert("Erro ao remover aluno: " + error.message);
    return;
  }

  alert(`Aluno "${nome}" removido com sucesso!`);
  await loadAlunos();
}

// Chamado ao entrar na aba Alunos
async function onAbaAlunos() {
  if (turmasParaAlunos.length === 0) {
    await carregarTurmasAlunos();
  }
}
