let turmaId = null;
let disciplinaId = null;

function voltarDashboard() {
  window.location.href = "dashboard-professor.html";
}

function carregarInfo() {
  turmaId = localStorage.getItem("turma_id");
  disciplinaId = localStorage.getItem("disciplina_id");
  const turmaNome = localStorage.getItem("turma_nome");
  const disciplinaNome = localStorage.getItem("disciplina_nome");

  if (!turmaId || !disciplinaId) {
    alert("Erro ao carregar dados.");
    voltarDashboard();
    return;
  }

  document.getElementById("infoTurmaDisciplina").innerText =
    `${turmaNome} - ${disciplinaNome}`;
}

async function carregarAlunos() {
  const bimestre = document.getElementById("bimestreSelect").value;

  const { data: alunos, error } = await supabaseClient
    .from("alunos")
    .select("id, nome, numero_chamada")
    .eq("turma_id", turmaId)
    .order("numero_chamada", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });

  if (error) {
    console.log(error);
    return;
  }

  const { data: notas } = await supabaseClient
    .from("notas_frequencia")
    .select("*")
    .eq("disciplina_id", disciplinaId)
    .eq("bimestre", bimestre);

  const tabela = document.getElementById("tabelaAlunos");
  tabela.innerHTML = "";

  tabela.innerHTML += `
    <table class="table table-bordered table-chamada">
      <thead>
        <tr>
          <th class="col-chamada">Nº</th>
          <th>Aluno</th>
          <th>Média</th>
          <th>Faltas</th>
        </tr>
      </thead>
      <tbody id="corpoTabela"></tbody>
    </table>
  `;

  const corpo = document.getElementById("corpoTabela");

  alunos.forEach(aluno => {
    const notaExistente = notas?.find(n => n.aluno_id === aluno.id);

    corpo.innerHTML += `
      <tr>
        <td class="col-chamada">${aluno.numero_chamada ?? ""}</td>
        <td class="col-aluno">${aluno.nome}</td>
        <td>
          <input type="number" min="0" max="10" step="0.1"
            class="form-control media"
            data-aluno="${aluno.id}"
            value="${notaExistente?.media ?? ''}">
        </td>
        <td>
          <input type="number" min="0"
            class="form-control faltas"
            data-aluno="${aluno.id}"
            value="${notaExistente?.faltas ?? ''}">
        </td>
      </tr>
    `;
  });
}

async function salvarNotas() {
  const bimestre = document.getElementById("bimestreSelect").value;

  const inputsMedia = document.querySelectorAll(".media");
  const inputsFaltas = document.querySelectorAll(".faltas");

  for (let i = 0; i < inputsMedia.length; i++) {
    const aluno_id = inputsMedia[i].dataset.aluno;
    const media = inputsMedia[i].value || null;
    const faltas = inputsFaltas[i].value || null;

    const { error } = await supabaseClient
      .from("notas_frequencia")
      .upsert([{
        aluno_id,
        disciplina_id: disciplinaId,
        bimestre,
        media,
        faltas
      }], {
        onConflict: ["aluno_id", "disciplina_id", "bimestre"]
      });

    if (error) {
      console.log(error);
      alert("Erro ao salvar notas.");
      return;
    }
  }

  alert("Notas salvas com sucesso!");
}

document.addEventListener("DOMContentLoaded", async () => {
  carregarInfo();
  await carregarAlunos();

  const fileInput = document.getElementById("inputMapao");
  if (fileInput) {
    fileInput.addEventListener("change", processarMapao);
  }
});

function importarMapao() {
  const input = document.getElementById("inputMapao");
  if (input) input.click();
}

async function processarMapao(event) {
  const file = event.target.files[0];
  if (!file) return;

  const disciplinaNome = localStorage.getItem("disciplina_nome");
  if (!disciplinaNome) {
    alert("Erro: nome da disciplina não encontrado no sistema.");
    return;
  }

  let disciplinasBanco = [];
  try {
    const { data: discData } = await supabaseClient
      .from("turma_disciplinas")
      .select("disciplinas(id, nome)")
      .eq("turma_id", turmaId);

    disciplinasBanco = (discData || [])
      .filter(d => d.disciplinas)
      .map(d => d.disciplinas.nome);
  } catch(e) {
    console.warn("Não foi possível buscar disciplinas do banco:", e);
  }

  function matchDisciplina(nomeMapao, nomeBanco) {
    const nm = normalizarTexto(nomeMapao);
    const nb = normalizarTexto(nomeBanco);
    return nb.startsWith(nm) || nm.startsWith(nb);
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerRowIndex = -1;

      for (let i = 0; i < json.length; i++) {
        if (compararTextos(json[i][0], "ALUNO")) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert("Não foi possível encontrar 'ALUNO'.");
        return;
      }

      const headerRow = json[headerRowIndex];
      let discColIndex = -1;

      for (let j = 0; j < headerRow.length; j++) {
        const cellValor = String(headerRow[j] ?? "").split("\n")[0].trim();
        if (cellValor && matchDisciplina(cellValor, disciplinaNome)) {
          discColIndex = j;
          break;
        }
      }

      if (discColIndex === -1) {
        alert(`Disciplina "${disciplinaNome}" não encontrada.`);
        return;
      }

      const subHeaderRow = json[headerRowIndex + 1];
      let mediaColIndex = -1;
      let faltasColIndex = -1;

      if (subHeaderRow) {
        for (let c = discColIndex; c < subHeaderRow.length; c++) {
          if (compararTextos(subHeaderRow[c], "M")) {
            mediaColIndex = c;
          } else if (compararTextos(subHeaderRow[c], "F")) {
            faltasColIndex = c;
          }
        }
      }

      let notasPreenchidas = 0;

      const rowsHtml = document.querySelectorAll("#corpoTabela tr");

      for (let r = headerRowIndex + 2; r < json.length; r++) {
        const rowData = json[r];
        const nomeExcel = rowData[0];

        if (nomeExcel && typeof nomeExcel === "string") {
          rowsHtml.forEach(tr => {
            const nomeHtml = tr.querySelector(".col-aluno")?.innerText;
            const inputMedia = tr.querySelector(".media");
            const inputFaltas = tr.querySelector(".faltas");

            if (nomeHtml && inputMedia && compararTextos(nomeHtml, nomeExcel)) {

              const notaExcel = rowData[mediaColIndex];
              if (notaExcel !== undefined && notaExcel !== "") {
                inputMedia.value = parseFloat(String(notaExcel).replace(",", "."));
                notasPreenchidas++;
              }

              const faltaExcel = rowData[faltasColIndex];
              if (faltaExcel !== undefined && faltaExcel !== "") {
                inputFaltas.value = parseFloat(String(faltaExcel).replace(",", "."));
              }
            }
          });
        }
      }

      if (notasPreenchidas > 0) {
        alert(`Sucesso! ${notasPreenchidas} notas foram importadas.`);
      } else {
        alert("Nenhuma nota foi encontrada.");
      }

    } catch (err) {
      console.error(err);
      alert("Erro ao processar o arquivo.");
    }

    event.target.value = "";
  };

  reader.readAsArrayBuffer(file);
}
