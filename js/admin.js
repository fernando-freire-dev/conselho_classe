async function checkAdmin() {
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

  if (!profile || profile.role !== "admin") {
    alert("Acesso restrito ao administrador.");
    window.location.href = "dashboard.html";
    return;
  }
}

// ================================
// CRIAR USUÁRIO via Edge Function
// ================================
async function criarUsuario() {
  const nome  = document.getElementById("novo_nome").value.trim();
  const email = document.getElementById("novo_email").value.trim();
  const senha = document.getElementById("novo_senha").value;
  const role  = document.getElementById("novo_role").value;

  const feedback = document.getElementById("feedbackCriarUsuario");
  const btn      = document.getElementById("btnCriarUsuario");
  const btnTexto = document.getElementById("btnCriarUsuarioTexto");
  const spinner  = document.getElementById("btnCriarUsuarioSpinner");

  feedback.innerHTML = "";

  if (!nome || !email || !senha || !role) {
    feedback.innerHTML = `<div class="alert alert-warning">Preencha todos os campos.</div>`;
    return;
  }

  if (senha.length < 6) {
    feedback.innerHTML = `<div class="alert alert-warning">A senha precisa ter no mínimo 6 caracteres.</div>`;
    return;
  }

  // Mostra loading
  btn.disabled = true;
  btnTexto.textContent = "Criando...";
  spinner.classList.remove("d-none");

  try {
    // Pega o token do usuário admin logado para autorizar a Edge Function
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;

    const SUPABASE_URL = supabaseClient.supabaseUrl;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/criar-usuario`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ nome, email, senha, role }),
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      feedback.innerHTML = `<div class="alert alert-danger">Erro: ${result.error || "Erro desconhecido."}</div>`;
      return;
    }

    feedback.innerHTML = `<div class="alert alert-success">${result.message}</div>`;

    // Limpa os campos
    document.getElementById("novo_nome").value  = "";
    document.getElementById("novo_email").value = "";
    document.getElementById("novo_senha").value = "";
    document.getElementById("novo_role").value  = "professor";

    await loadUsers();

  } catch (err) {
    feedback.innerHTML = `<div class="alert alert-danger">Erro de conexão: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnTexto.textContent = "Criar Usuário";
    spinner.classList.add("d-none");
  }
}

// Cache de todos os usuários para o filtro funcionar sem nova consulta
let todosUsuarios = [];

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  todosUsuarios = data || [];
  renderUsers();
}

function renderUsers() {
  const container = document.getElementById("userList");
  if (!container) return;

  const termoBusca = (document.getElementById("buscaUsuario")?.value || "").toLowerCase().trim();
  const filtroRole = document.getElementById("filtroRoleUsuario")?.value || "";

  let lista = todosUsuarios;

  if (termoBusca) {
    lista = lista.filter(u => u.nome?.toLowerCase().includes(termoBusca));
  }

  if (filtroRole) {
    lista = lista.filter(u => u.role === filtroRole);
  }

  if (lista.length === 0) {
    container.innerHTML = "<p class='text-muted'>Nenhum usuário encontrado.</p>";
    return;
  }

  const badgeColor = {
    admin: "danger",
    coordenacao: "primary",
    professor: "success",
  };

  container.innerHTML = lista.map(user => `
    <div class="d-flex justify-content-between align-items-center border rounded p-2 mb-2">
      <div>
        <strong>${user.nome}</strong>
        <span class="badge text-bg-${badgeColor[user.role] || "secondary"} ms-2">${user.role}</span>
        <span class="text-muted small ms-2">${user.email || ""}</span>
      </div>
      <button class="btn btn-sm btn-outline-danger" onclick="confirmarExcluirUsuario('${user.id}', '${user.nome.replace(/'/g, "\\'")}', '${user.role}')">
        Excluir
      </button>
    </div>
  `).join("");
}

async function confirmarExcluirUsuario(userId, nome, role) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user?.id === userId) {
    alert("Você não pode excluir sua própria conta.");
    return;
  }

  const problemas = [];

  const { data: vinculoTurma } = await supabaseClient
    .from("professor_turma")
    .select("turmas(nome)")
    .eq("professor_id", userId);

  if (vinculoTurma && vinculoTurma.length > 0) {
    const turmas = vinculoTurma.map(v => v.turmas?.nome || "?").join(", ");
    problemas.push("• Professor representante das turmas: " + turmas);
  }

  const { data: vinculoAcademico } = await supabaseClient
    .from("professor_disciplina_turma")
    .select("turmas(nome), disciplinas(nome)")
    .eq("professor_id", userId);

  if (vinculoAcademico && vinculoAcademico.length > 0) {
    const itens = vinculoAcademico.map(v => (v.turmas?.nome || "?") + " / " + (v.disciplinas?.nome || "?")).join(", ");
    problemas.push("• Vínculos acadêmicos: " + itens);
  }

  if (problemas.length > 0) {
    alert(
      "Não é possível excluir \"" + nome + "\" pois ele possui vínculos ativos:\n\n" +
      problemas.join("\n") +
      "\n\nRemova esses vínculos primeiro na seção correspondente."
    );
    return;
  }

  const confirmar = confirm(
    "Tem certeza que deseja excluir o usuário \"" + nome + "\"?\n\nEssa ação é permanente e não pode ser desfeita."
  );
  if (!confirmar) return;

  await excluirUsuario(userId, nome);
}

async function excluirUsuario(userId, nome) {
  const { error: errProfile } = await supabaseClient
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (errProfile) {
    alert("Erro ao excluir perfil: " + errProfile.message);
    console.log(errProfile);
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    const SUPABASE_URL = supabaseClient.supabaseUrl;

    const response = await fetch(SUPABASE_URL + "/functions/v1/criar-usuario", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
      },
      body: JSON.stringify({ userId }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.warn("Aviso: perfil removido mas erro ao remover do Auth:", result.error);
    }
  } catch (err) {
    console.warn("Aviso: perfil removido mas erro ao remover do Auth:", err.message);
  }

  alert("Usuário \"" + nome + "\" excluído com sucesso!");
  await loadUsers();
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

//Criar turmas no banco de dados
async function createTurma() {
  const nomeInput = document.getElementById("turma_nome");
  const anoInput = document.getElementById("turma_ano");
  const ensinoInput = document.getElementById("turma_ensino");

  const nome = nomeInput.value.trim();
  const ano = anoInput.value;
  const ensino = ensinoInput.value;

  if (!nome || !ano || !ensino) {
    alert("Preencha todos os campos");
    return;
  }

  const { error } = await supabaseClient
    .from("turmas")
    .insert([{ nome, ano, ensino }]);

  if (error) {
    if (error.code === "23505") alert("Essa turma já existe para esse ano.");
    else alert("Erro ao criar turma");
    console.log(error);
  } else {
    alert("Turma criada com sucesso!");
    nomeInput.value = "";
    anoInput.value = "";
    ensinoInput.value = "";
    await loadTurmas();
    await loadTurmasSelect();
    await loadSelectsAcademico();
    await loadFiltroTurmasVinculo();
  }
}

//Carregar turmas do banco de dados
async function loadTurmas() {
  const { data, error } = await supabaseClient
    .from("turmas")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  const container = document.getElementById("turmaList");
  if (!container) return;
  container.innerHTML = "";

  data.forEach(turma => {
    container.innerHTML += `
      <div class="d-flex justify-content-between align-items-center border p-2 mb-2">
        <span><strong>${turma.nome}</strong> - ${turma.ano}</span>
        
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" 
                  onclick="abrirModalDisciplinas('${turma.id}', '${turma.nome}')">
             Disciplinas
          </button>
          <button class="btn btn-sm btn-danger"
                  onclick="deleteTurma('${turma.id}')">
             Excluir
          </button>
        </div>
      </div>
    `;
  });
}

//Deletar turma cadastrada
async function deleteTurma(id) {
  const confirmar = confirm("Tem certeza que deseja excluir essa turma?");
  if (!confirmar) return;

  const { data, error } = await supabaseClient
    .from("turmas")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    alert("Erro ao excluir turma");
    console.log(error);
    return;
  }

  if (!data || data.length === 0) {
    alert("Não foi possível excluir (sem permissão/RLS). Confirme as policies do Supabase.");
    return;
  }

  alert("Turma excluída com sucesso!");
  await loadTurmas();
  await loadTurmasSelect();
  await loadSelectsAcademico();
  await loadFiltroTurmasVinculo();
  await loadVinculosAcademicos();
}

//Carregar professores (apenas role professor)
async function loadProfessoresSelect() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, nome")
    .eq("role", "professor")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("select_professor");
  if (!select) return;
  select.innerHTML = "";

  data.forEach(prof => {
    select.innerHTML += `
      <option value="${prof.id}">
        ${prof.nome}
      </option>
    `;
  });
}

//Carrega turmas no select
async function loadTurmasSelect() {
  const { data, error } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("select_turma");
  if (!select) return;
  select.innerHTML = "";

  data.forEach(turma => {
    select.innerHTML += `
      <option value="${turma.id}">
        ${turma.nome} - ${turma.ano}
      </option>
    `;
  });
}

//Função para vincular professor e turma
async function vincularProfessor() {
  const professor_id = document.getElementById("select_professor").value;
  const turma_id = document.getElementById("select_turma").value;

  const { error } = await supabaseClient
    .from("professor_turma")
    .insert([{ professor_id, turma_id }]);

  if (error) {
    if (error.code === "23505") {
      alert("Esse professor já está vinculado a uma turma.");
    } else {
      alert("Erro ao vincular professor.");
    }
    console.log(error);
  } else {
    alert("Professor vinculado com sucesso!");
    loadVinculos();
  }
}

//Listar vínculos atuais com botão de edição que abre o modal
async function loadVinculos() {
  const { data, error } = await supabaseClient
    .from("professor_turma")
    .select(`
      id,
      professor_id,
      turma_id,
      profiles ( nome ),
      turmas ( nome, ano )
    `);

  if (error) {
    console.log(error);
    return;
  }

  const container = document.getElementById("vinculoList");
  if (!container) return;
  container.innerHTML = "";

  data.forEach(v => {
    const vinculo = {
      id: v.id,
      professor_id: v.professor_id,
      turma_nome: `${v.turmas.nome} - ${v.turmas.ano}`,
      professor_nome: v.profiles.nome
    };

    container.innerHTML += `
      <div class="d-flex justify-content-between align-items-center border p-2 mb-2">
        <span>
          ${v.profiles.nome} → ${v.turmas.nome} - ${v.turmas.ano}
        </span>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-warning"
            onclick='abrirModalEditar(${JSON.stringify(vinculo)})'>
            Editar
          </button>
          <button class="btn btn-sm btn-danger"
            onclick="excluirVinculo('${v.id}', '${v.profiles.nome.replace(/'/g, "\\'")}', '${(v.turmas.nome + ' - ' + v.turmas.ano).replace(/'/g, "\\'")}')">
            Excluir
          </button>
        </div>
      </div>
    `;
  });
}

// Excluir vínculo professor representante
async function excluirVinculo(vinculoId, professorNome, turmaNome) {
  const confirmar = confirm(
    `Deseja excluir o vínculo de "${professorNome}" com a turma "${turmaNome}"?\n\nO professor deixará de ser representante dessa turma.`
  );
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("professor_turma")
    .delete()
    .eq("id", vinculoId);

  if (error) {
    alert("Erro ao excluir vínculo: " + error.message);
    console.log(error);
    return;
  }

  alert("Vínculo excluído com sucesso!");
  await loadVinculos();
}

//Função para editar o trocar o professor representante da sala
async function editarVinculo(vinculo_id, professorAtualId) {
  const novoProfessor = document.getElementById("select_professor").value;

  if (!novoProfessor) {
    alert("Selecione um professor.");
    return;
  }

  if (novoProfessor === professorAtualId) {
    alert("Selecione um professor diferente do atual.");
    return;
  }

  const confirmar = confirm("Deseja substituir o professor desta turma?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("professor_turma")
    .update({ professor_id: novoProfessor })
    .eq("id", vinculo_id);

  if (error) {
    if (error.code === "23505") {
      alert("Esse professor já está vinculado a outra turma.");
    } else {
      alert("Erro ao atualizar vínculo.");
    }
    console.log(error);
  } else {
    alert("Vínculo atualizado com sucesso!");
    loadVinculos();
  }
}

let vinculoEditando = null;
let professorAtualId = null;
let professoresDisponiveis = [];
let professorSelecionadoFiltro = "";
let modalEditarInstance = null;

//Função para abrir o modal de alteração do vinculo
async function abrirModalEditar(vinculo) {
  vinculoEditando = vinculo.id;
  professorAtualId = vinculo.professor_id;

  document.getElementById("modalTurma").textContent = vinculo.turma_nome;
  document.getElementById("modalProfessorAtual").textContent = vinculo.professor_nome;

  const select = document.getElementById("modalSelectProfessor");
  select.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, nome")
    .eq("role", "professor")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  data.forEach(prof => {
    const option = document.createElement("option");
    option.value = prof.id;
    option.textContent = prof.nome;
    select.appendChild(option);
  });

  const modalEl = document.getElementById("modalEditar");
  if (!modalEditarInstance) {
    modalEditarInstance = new bootstrap.Modal(modalEl);
  }
  modalEditarInstance.show();
}

//Função Salvar mudança de vinculo
async function salvarEdicao() {
  const novoProfessor = document.getElementById("modalSelectProfessor").value;

  if (novoProfessor === professorAtualId) {
    alert("Selecione um professor diferente.");
    return;
  }

  const { error } = await supabaseClient
    .from("professor_turma")
    .update({ professor_id: novoProfessor })
    .eq("id", vinculoEditando);

  if (error) {
    if (error.code === "23505") {
      alert("Esse professor já está vinculado a outra turma.");
    } else {
      alert("Erro ao atualizar vínculo.");
    }
    console.log(error);
  } else {
    alert("Vínculo atualizado com sucesso!");
    fecharModal();
    loadVinculos();
  }
}

function fecharModal() {
  modalEditarInstance?.hide();
}

//Mostrar as seções da página admin
function mostrarSecao(secao) {
  const secoes = ["perfil", "turma", "vinculo", "vinculo-academico", "disciplinas"];

  secoes.forEach(s => {
    const div = document.getElementById("secao-" + s);
    if (div) {
      div.style.display = (s === secao) ? "block" : "none";
    }
  });

  // Carrega disciplinas ao entrar na seção
  if (secao === "disciplinas") loadDisciplinasAdmin();
}

// ── Gerenciamento de Apelidos de Disciplinas ──────────────────

async function loadDisciplinasAdmin() {
  const container = document.getElementById("listaDisciplinasAdmin");
  if (!container) return;
  container.innerHTML = `<p class="text-muted">Carregando...</p>`;

  const { data, error } = await supabaseClient
    .from("disciplinas")
    .select("id, nome, apelido")
    .order("nome", { ascending: true });

  if (error) {
    container.innerHTML = `<div class="alert alert-danger">Erro ao carregar disciplinas.</div>`;
    console.log(error);
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="text-muted">Nenhuma disciplina cadastrada.</p>`;
    return;
  }

  container.innerHTML = data.map(disc => `
    <div class="d-flex align-items-center gap-3 border rounded p-2 mb-2">
      <div style="min-width:280px;">
        <span class="fw-semibold">${disc.nome}</span>
      </div>
      <div class="flex-grow-1">
        <input
          type="text"
          class="form-control form-control-sm"
          id="apelido_${disc.id}"
          placeholder="Apelido curto (ex: Prog. Back-End)"
          value="${disc.apelido || ""}"
          maxlength="40"
        >
      </div>
      <button class="btn btn-sm btn-outline-primary" onclick="salvarApelido('${disc.id}')">
        Salvar
      </button>
    </div>
  `).join("");
}

async function salvarApelido(discId) {
  const input = document.getElementById(`apelido_${discId}`);
  if (!input) return;

  const apelido = input.value.trim() || null;

  const { data, error } = await supabaseClient
    .from("disciplinas")
    .update({ apelido })
    .eq("id", discId)
    .select("id, nome, apelido");

  if (error) {
    alert("Erro ao salvar apelido: " + error.message);
    console.log(error);
    return;
  }

  if (!data || data.length === 0) {
    alert("Nenhuma disciplina foi atualizada.");
    return;
  }

  console.log("Disciplina atualizada:", data[0]);

  const linha = input.closest(".d-flex");
  const btn = linha?.querySelector("button");
  if (!btn) return;

  const originalText = btn.textContent;
  btn.textContent = "✅ Salvo";
  btn.classList.remove("btn-outline-primary");
  btn.classList.add("btn-success");

  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove("btn-success");
    btn.classList.add("btn-outline-primary");
  }, 2000);
}

//Carregar disciplinas no Select
async function loadDisciplinasSelect() {
  const { data, error } = await supabaseClient
    .from("disciplinas")
    .select("id, nome")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("select_disciplina_academico");
  if (!select) return;
  select.innerHTML = "";

  data.forEach(disc => {
    select.innerHTML += `
      <option value="${disc.id}">
        ${disc.nome}
      </option>
    `;
  });
}

// Carregar professores e turmas para a nova seção
async function loadSelectsAcademico() {
  const profSelect = document.getElementById("select_professor_academico");
  const turmaSelect = document.getElementById("select_turma_academico");
  const discSelect = document.getElementById("select_disciplina_academico");

  const { data: professores, error: profError } = await supabaseClient
    .from("profiles")
    .select("id, nome")
    .eq("role", "professor")
    .order("nome", { ascending: true });

  if (profError) {
    console.log(profError);
    return;
  }

  if (profSelect) {
    profSelect.innerHTML = `<option value="">Selecione...</option>`;
    professores.forEach(prof => {
      profSelect.innerHTML += `
        <option value="${prof.id}">
          ${prof.nome}
        </option>
      `;
    });
  }

  const { data: turmas, error: turmaError } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano")
    .order("nome", { ascending: true });

  if (turmaError) {
    console.log(turmaError);
    return;
  }

  if (turmaSelect) {
    turmaSelect.innerHTML = `<option value="">Selecione a turma</option>`;
    turmas.forEach(t => {
      turmaSelect.innerHTML += `
        <option value="${t.id}">
          ${t.nome} - ${t.ano}
        </option>
      `;
    });
  }

  if (discSelect) {
    discSelect.innerHTML = `<option value="">Selecione a turma</option>`;
    discSelect.value = "";
  }
}

//Função para vincular professor/disciplina/turma
async function vincularAcademico() {
  const professor_id = document.getElementById("select_professor_academico").value;
  const turma_id = document.getElementById("select_turma_academico").value;
  const disciplina_id = document.getElementById("select_disciplina_academico").value;

  if (!professor_id || !turma_id || !disciplina_id) {
    alert("Selecione professor, turma e disciplina.");
    return;
  }

  const { data: existente, error: errBusca } = await supabaseClient
    .from("professor_disciplina_turma")
    .select("id, professor_id")
    .eq("turma_id", turma_id)
    .eq("disciplina_id", disciplina_id)
    .maybeSingle();

  if (errBusca) {
    console.log(errBusca);
    alert("Erro ao verificar vínculo existente.");
    return;
  }

  if (existente) {
    alert("Já existe professor nessa disciplina/turma. Exclua o vínculo atual para trocar.");
    return;
  }

  const { error } = await supabaseClient
    .from("professor_disciplina_turma")
    .insert([{ professor_id, turma_id, disciplina_id }]);

  if (error) {
    if (error.code === "23505") {
      alert("Essa disciplina já tem professor vinculado nessa turma. Exclua o vínculo atual para trocar.");
    } else {
      alert("Erro ao vincular.");
    }
    console.log(error);
  } else {
    alert("Vínculo criado com sucesso!");
    loadVinculosAcademicos();
  }
}

async function carregarProfessoresParaFiltro() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("nome")
    .eq("role", "professor")
    .order("nome", { ascending: true });

  if (error) {
    console.log("Erro ao carregar professores para filtro:", error);
    professoresDisponiveis = [];
    return;
  }

  professoresDisponiveis = [...new Set((data || []).map(p => p.nome).filter(Boolean))];
}

function limparFiltroProfessor() {
  professorSelecionadoFiltro = "";

  const input = document.getElementById("filtro_professor_vinculo");
  const lista = document.getElementById("lista_sugestoes_professor");
  const msg = document.getElementById("msg_professor_nao_encontrado");

  if (input) input.value = "";
  if (lista) lista.innerHTML = "";
  if (msg) msg.classList.add("d-none");

  loadVinculosAcademicos();
}

function selecionarProfessorFiltro(nome) {
  const input = document.getElementById("filtro_professor_vinculo");
  const lista = document.getElementById("lista_sugestoes_professor");
  const msg = document.getElementById("msg_professor_nao_encontrado");

  professorSelecionadoFiltro = nome;

  if (input) input.value = nome;
  if (lista) lista.innerHTML = "";
  if (msg) msg.classList.add("d-none");

  loadVinculosAcademicos();
}

function filtrarSugestoesProfessor() {
  const input = document.getElementById("filtro_professor_vinculo");
  const lista = document.getElementById("lista_sugestoes_professor");
  const msg = document.getElementById("msg_professor_nao_encontrado");

  if (!input) {
    loadVinculosAcademicos();
    return;
  }

  const termoOriginal = input.value.trim();
  const termo = termoOriginal.toLowerCase();

  if (professorSelecionadoFiltro && termoOriginal !== professorSelecionadoFiltro) {
    professorSelecionadoFiltro = "";
  }

  if (lista) lista.innerHTML = "";
  if (msg) msg.classList.add("d-none");

  if (!termo) {
    loadVinculosAcademicos();
    return;
  }

  const correspondencias = professoresDisponiveis.filter(nome =>
    nome.toLowerCase().includes(termo)
  );

  if (lista) {
    correspondencias.slice(0, 8).forEach(nome => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "list-group-item list-group-item-action";
      item.textContent = nome;
      item.onclick = () => selecionarProfessorFiltro(nome);
      lista.appendChild(item);
    });
  }

  if (correspondencias.length === 0 && msg) {
    msg.classList.remove("d-none");
  }

  loadVinculosAcademicos();
}

//Listar vinculos academicos
async function loadVinculosAcademicos() {
  const turmaFiltro = document.getElementById("filtro_turma_vinculo")?.value || "";
  const professorDigitado = document.getElementById("filtro_professor_vinculo")?.value?.trim() || "";
  const professorFiltro = professorSelecionadoFiltro || professorDigitado;

  let query = supabaseClient
    .from("professor_disciplina_turma")
    .select(`
      id,
      turma_id,
      profiles ( nome ),
      turmas ( nome, ano ),
      disciplinas ( nome )
    `);

  if (turmaFiltro) {
    query = query.eq("turma_id", turmaFiltro);
  }

  const { data, error } = await query;

  if (error) {
    console.log(error);
    return;
  }

  let dadosFiltrados = data || [];

  if (professorFiltro) {
    dadosFiltrados = dadosFiltrados.filter(v =>
      (v.profiles?.nome || "").toLowerCase().includes(professorFiltro.toLowerCase())
    );
  }

  const container = document.getElementById("vinculoAcademicoList");
  if (!container) return;
  container.innerHTML = "";

  if (dadosFiltrados.length === 0) {
    container.innerHTML = "<p>Nenhum vínculo encontrado.</p>";
    return;
  }

  dadosFiltrados.forEach(v => {
    container.innerHTML += `
      <div class="d-flex justify-content-between align-items-center border p-2 mb-2 rounded">
        <span>
          ${v.profiles?.nome || "-"} →
          ${v.turmas?.nome || "-"} - ${v.turmas?.ano || "-"} →
          ${v.disciplinas?.nome || "-"}
        </span>
        <button class="btn btn-sm btn-danger"
          onclick="excluirVinculoAcademico('${v.id}')">
          Excluir
        </button>
      </div>
    `;
  });
}

//Excluir vinculo academico
async function excluirVinculoAcademico(id) {
  const confirmar = confirm("Deseja realmente excluir este vínculo?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("professor_disciplina_turma")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erro ao excluir vínculo.");
    console.log(error);
  } else {
    alert("Vínculo excluído com sucesso!");
    await carregarProfessoresParaFiltro();
    loadVinculosAcademicos();
  }
}

//Carregar as disciplinas da turma selecionada
async function carregarDisciplinasDaTurma() {
  const turma_id = document.getElementById("select_turma_academico").value;
  const select = document.getElementById("select_disciplina_academico");

  if (!select) return;

  if (!turma_id) {
    select.innerHTML = `<option value="">Selecione a turma</option>`;
    return;
  }

  const { data, error } = await supabaseClient
    .from("turma_disciplinas")
    .select(`
      disciplina_id,
      disciplinas ( id, nome )
    `)
    .eq("turma_id", turma_id);

  if (error) {
    console.log(error);
    return;
  }

  select.innerHTML = "";

  if (!data || data.length === 0) {
    select.innerHTML = `<option value="">Nenhuma disciplina encontrada</option>`;
    return;
  }

  data.forEach(item => {
    select.innerHTML += `
      <option value="${item.disciplinas.id}">
        ${item.disciplinas.nome}
      </option>
    `;
  });
}

//Filtro de turmas dos vinculos de professor/disciplina/turma
async function loadFiltroTurmasVinculo() {
  const { data, error } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano")
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("filtro_turma_vinculo");
  if (!select) return;
  select.innerHTML = `<option value="">Todas as turmas</option>`;

  data.forEach(turma => {
    select.innerHTML += `
      <option value="${turma.id}">
        ${turma.nome} - ${turma.ano}
      </option>
    `;
  });
}

/*/ Chamar no carregamento da página (no final do DOMContentLoaded existente)
document.addEventListener("DOMContentLoaded", () => {
  // ... outras funções ...
  carregarMatrizVinculos();
});*/
/*Carrega as disciplinas vinculadas a uma turma*/
async function carregarMatrizVinculos() {
  const corpoTabela = document.getElementById("corpoMatrizVinculos");
  if (!corpoTabela) return;

  corpoTabela.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Carregando grade curricular...</td></tr>`;

  try {
    // 1. Busca todas as turmas
    const { data: turmas, error: errT } = await supabaseClient
      .from("turmas")
      .select("id, nome, ano, ensino")
      .order("nome");

    if (errT) throw errT;

    // 2. Busca os vínculos da tabela correta: turma_disciplina
    // Puxando o nome da disciplina via JOIN
    const { data: vinculos, error: errV } = await supabaseClient
      .from("turma_disciplinas")
      .select(`
        turma_id,
        disciplinas ( nome )
      `);

    if (errV) throw errV;

    corpoTabela.innerHTML = ""; 

    turmas.forEach(turma => {
      // Filtra as disciplinas vinculadas a esta turma específica
      const discNomes = vinculos
        .filter(v => v.turma_id === turma.id)
        .map(v => v.disciplinas?.nome)
        .filter(Boolean);

      const unicas = [...new Set(discNomes)].sort();
      
      const badges = unicas.length > 0 
        ? unicas.map(d => `<span class="badge bg-light text-primary border me-1 mb-1">${d}</span>`).join('')
        : `<span class="text-danger small fw-bold">⚠️ NENHUMA DISCIPLINA VINCULADA</span>`;

      corpoTabela.innerHTML += `
        <tr>
          <td class="align-middle"><strong>${turma.nome}</strong></td>
          <td class="align-middle"><small class="text-muted">${turma.ensino || ''} - ${turma.ano || ''}</small></td>
          <td class="align-middle">${badges}</td>
          <td class="text-center align-middle">
            <span class="badge ${unicas.length > 0 ? 'bg-primary' : 'bg-danger'}">
              ${unicas.length}
            </span>
          </td>
        </tr>`;
    });

  } catch (error) {
    console.error("Erro na matriz:", error);
    corpoTabela.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erro ao carregar dados: ${error.message}</td></tr>`;
  }
}

document.addEventListener("click", function (e) {
  const input = document.getElementById("filtro_professor_vinculo");
  const lista = document.getElementById("lista_sugestoes_professor");

  if (!input || !lista) return;

  if (!input.contains(e.target) && !lista.contains(e.target)) {
    lista.innerHTML = "";
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await checkAdmin();
  await loadUsers();
  await loadTurmas();
  await loadProfessoresSelect();
  await loadTurmasSelect();
  await loadVinculos();
  await loadSelectsAcademico();
  await loadFiltroTurmasVinculo();
  await carregarProfessoresParaFiltro();
  await loadVinculosAcademicos();
  await carregarMatrizVinculos();
});
