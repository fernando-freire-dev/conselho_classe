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

async function createProfile() {
  const nome = document.getElementById("nome").value;
  const user_id = document.getElementById("user_id").value;
  const role = document.getElementById("role").value;

  const { error } = await supabaseClient
    .from("profiles")
    .insert([
      {
        id: user_id,
        nome: nome,
        role: role
      }
    ]);

  if (error) {
    alert("Erro ao salvar perfil.");
    console.log(error);
  } else {
    alert("Perfil criado com sucesso!");
    loadUsers();
  }
}

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*");

  if (error) {
    console.log(error);
    return;
  }

  const container = document.getElementById("userList");
  container.innerHTML = "";

  data.forEach(user => {
    container.innerHTML += `
      <p><strong>${user.nome}</strong> - ${user.role}</p>
    `;
  });
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
  container.innerHTML = "";

  data.forEach(turma => {
    container.innerHTML += `
      <div class="d-flex justify-content-between align-items-center border p-2 mb-2">
        <span><strong>${turma.nome}</strong> - ${turma.ano}</span>
        <button class="btn btn-sm btn-danger"
          onclick="deleteTurma('${turma.id}')">
          Excluir
        </button>
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
    .select("id"); // <- força retorno do que foi deletado

  if (error) {
    alert("Erro ao excluir turma");
    console.log(error);
    return;
  }

  // Se não veio nada, não deletou (RLS ou filtro não bateu)
  if (!data || data.length === 0) {
    alert("Não foi possível excluir (sem permissão/RLS). Confirme as policies do Supabase.");
    return;
  }

  alert("Turma excluída com sucesso!");
  await loadTurmas();
}

//Carregar professores (apenas role professor)
async function loadProfessoresSelect() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, nome")
    .eq("role", "professor");

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("select_professor");
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
  container.innerHTML = "";

  data.forEach(v => {
    // Criar objeto do vínculo para passar para o modal
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
        <button class="btn btn-sm btn-warning"
          onclick='abrirModalEditar(${JSON.stringify(vinculo)})'>
          Editar
        </button>
      </div>
    `;
  });
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

//Função para abrir o modal de alteração do vinculo

async function abrirModalEditar(vinculo) {

  vinculoEditando = vinculo.id;
  professorAtualId = vinculo.professor_id;

  document.getElementById("modalTurma").textContent = vinculo.turma_nome;
  document.getElementById("modalProfessorAtual").textContent = vinculo.professor_nome;

  const select = document.getElementById("modalSelectProfessor");
  select.innerHTML = "";

  // carregar professores disponíveis
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, nome")
    .eq("role", "professor");

  data.forEach(prof => {
    const option = document.createElement("option");
    option.value = prof.id;
    option.textContent = prof.nome;
    select.appendChild(option);
  });

  document.getElementById("modalEditar").style.display = "flex";
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
  } else {
    alert("Vínculo atualizado com sucesso!");
    fecharModal();
    loadVinculos();
  }
}
function fecharModal() {
  document.getElementById("modalEditar").style.display = "none";
}

//Mostrar as seções da página admin
function mostrarSecao(secao) {
  const secoes = ['perfil', 'turma', 'vinculo', 'vinculo-academico'];

  secoes.forEach(s => {
    const div = document.getElementById('secao-' + s);
    div.style.display = (s === secao) ? 'block' : 'none';
  });
}

//Carregar disciplinas no Select
async function loadDisciplinasSelect() {
  const { data, error } = await supabaseClient
    .from("disciplinas")
    .select("id, nome");

  if (error) {
    console.log(error);
    return;
  }

  const select = document.getElementById("select_disciplina_academico");
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

  const { data: professores } = await supabaseClient
    .from("profiles")
    .select("id, nome")
    .eq("role", "professor");

  const profSelect = document.getElementById("select_professor_academico");
	profSelect.innerHTML = `<option value="">Selecione...</option>`;

	professores.forEach(prof => {
	  profSelect.innerHTML += `
		<option value="${prof.id}">
		  ${prof.nome}
		</option>
	  `;
	});

  const { data: turmas } = await supabaseClient
    .from("turmas")
    .select("id, nome, ano")
	.order("nome", { ascending: true });

  const turmaSelect = document.getElementById("select_turma_academico");
	turmaSelect.innerHTML = `<option value="">Selecione a turma</option>`;

	turmas.forEach(t => {
	  turmaSelect.innerHTML += `
		<option value="${t.id}">
		  ${t.nome} - ${t.ano}
		</option>
	  `;
	});
	
	const discSelect = document.getElementById("select_disciplina_academico");
	discSelect.innerHTML = `<option value="">Selecione a turma</option>`;
	discSelect.value = "";

  //await loadDisciplinasSelect();
}

//Função para vincular professor/disciplina/turma
async function vincularAcademico() {

  const professor_id = document.getElementById("select_professor_academico").value;
  const turma_id = document.getElementById("select_turma_academico").value;
  const disciplina_id = document.getElementById("select_disciplina_academico").value;
  
  //bloquear inserir mais de 1 professor a disciplina na mesma turma
  const { data: existente, error: errBusca } = await supabaseClient
	  .from("professor_disciplina_turma")
	  .select("id, professor_id")
	  .eq("turma_id", turma_id)
	  .eq("disciplina_id", disciplina_id)
	  .maybeSingle();

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

//Listar vinculos academicos
async function loadVinculosAcademicos() {

  const turmaFiltro = document.getElementById("filtro_turma_vinculo")?.value;

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

  const container = document.getElementById("vinculoAcademicoList");
  container.innerHTML = "";

  if (data.length === 0) {
    container.innerHTML = "<p>Nenhum vínculo encontrado.</p>";
    return;
  }

  data.forEach(v => {
    container.innerHTML += `
      <div class="d-flex justify-content-between align-items-center border p-2 mb-2">
        <span>
          ${v.profiles.nome} → 
          ${v.turmas.nome} - ${v.turmas.ano} → 
          ${v.disciplinas.nome}
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
    loadVinculosAcademicos();
  }
}

//Carregar as disciplinas da turma selecionada
async function carregarDisciplinasDaTurma() {

  const turma_id = document.getElementById("select_turma_academico").value;

  if (!turma_id) return;

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

  const select = document.getElementById("select_disciplina_academico");
  select.innerHTML = "";

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
  select.innerHTML = `<option value="">Todas as turmas</option>`;

  data.forEach(turma => {
    select.innerHTML += `
      <option value="${turma.id}">
        ${turma.nome} - ${turma.ano}
      </option>
    `;
  });
}


document.addEventListener("DOMContentLoaded", async () => {
  await checkAdmin();
  await loadUsers();
  await loadTurmas();
  await loadProfessoresSelect();
  await loadTurmasSelect();
  await loadVinculos();
  await loadSelectsAcademico();
  await loadFiltroTurmasVinculo();
  await loadVinculosAcademicos();
});

