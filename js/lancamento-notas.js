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

  // Listener para o input de arquivo
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

  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      // Assume que os dados estão na primeira aba
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      // Converte para array de arrays (header: 1) para facilitar a iteração
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // 1. Encontrar a linha de cabeçalho (Procurar "ALUNO" na primeira coluna)
      let headerRowIndex = -1;
      let alunoColIndex = 0; // Padrão: coluna A

      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        // Verifica a primeira célula da linha (índice 0)
        if (row[0] && typeof row[0] === "string" && row[0].trim().toUpperCase() === "ALUNO") {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert("Não foi possível encontrar a célula 'ALUNO' na primeira coluna do arquivo.");
        return;
      }

      // 2. Encontrar a coluna da Disciplina
      const disciplinaNome = localStorage.getItem("disciplina_nome");
      if (!disciplinaNome) {
        alert("Erro: Nome da disciplina não encontrado no sistema.");
        return;
      }

      const headerRow = json[headerRowIndex];
      let discColIndex = -1;
      const targetDisc = disciplinaNome.trim().toUpperCase();

      for (let j = 0; j < headerRow.length; j++) {
        const cellValue = headerRow[j];
        if (typeof cellValue === "string" && cellValue.trim().toUpperCase() === targetDisc) {
          discColIndex = j;
          break;
        }
      }

      if (discColIndex === -1) {
        alert(`Disciplina "${disciplinaNome}" não encontrada na linha de cabeçalho do arquivo.`);
        return;
      }

      // 3. Identificar o range da célula mesclada da disciplina
      // Se a célula estiver mesclada, precisamos saber onde ela termina para buscar "M" dentro desse intervalo
      let endColIndex = discColIndex;
      if (sheet['!merges']) {
        const merge = sheet['!merges'].find(m => m.s.r === headerRowIndex && m.s.c === discColIndex);
        if (merge) {
          endColIndex = merge.e.c;
        }
      }

      // 4. Encontrar a coluna "M" (Média) na linha abaixo
      const subHeaderRow = json[headerRowIndex + 1];
      let mediaColIndex = -1;

      if (subHeaderRow) {
        for (let c = discColIndex; c <= endColIndex; c++) {
          const val = subHeaderRow[c];
          if (typeof val === "string" && val.trim().toUpperCase() === "M") {
            mediaColIndex = c;
            break;
          }
        }
      }

      if (mediaColIndex === -1) {
        alert("Coluna 'M' (Média) não encontrada abaixo da disciplina.");
        return;
      }

      // 5. Ler as notas e preencher os inputs
      let notasPreenchidas = 0;
      const rowsHtml = document.querySelectorAll("#corpoTabela tr");

      // Começamos a ler os alunos duas linhas abaixo do cabeçalho "ALUNO"
      // Linha headerRowIndex = ALUNO / DISCIPLINA
      // Linha headerRowIndex + 1 = M / F / AC
      // Linha headerRowIndex + 2 = Dados dos alunos
      for (let r = headerRowIndex + 2; r < json.length; r++) {
        const rowData = json[r];
        const nomeExcel = rowData[alunoColIndex]; // Nome na coluna 0 (ALUNO)

        if (nomeExcel && typeof nomeExcel === "string") {
          // Tenta encontrar o aluno no HTML
          rowsHtml.forEach(tr => {
            const nomeHtml = tr.querySelector(".col-aluno")?.innerText;
            const inputMedia = tr.querySelector(".media");

            // Comparação simples (normalizando strings)
            if (nomeHtml && inputMedia &&
              nomeHtml.trim().toUpperCase() === nomeExcel.trim().toUpperCase()) {

              const notaExcel = rowData[mediaColIndex];
              // Verifica se é numérico ou string numérica válida
              if (notaExcel !== undefined && notaExcel !== null && notaExcel !== "") {
                // Se vier com vírgula (formato BR string), troca por ponto
                let notaFormatada = String(notaExcel).replace(",", ".");
                const valorFloat = parseFloat(notaFormatada);

                if (!isNaN(valorFloat)) {
                  inputMedia.value = valorFloat; // Atribui o valor ao input
                  notasPreenchidas++;
                }
              }
            }
          });
        }
      }

      if (notasPreenchidas > 0) {
        alert(`Sucesso! ${notasPreenchidas} notas foram importadas.`);
      } else {
        alert("Nenhuma nota foi preenchida. Verifique se os nomes dos alunos correspondem.");
      }

    } catch (error) {
      console.error(error);
      alert("Erro ao processar o arquivo.");
    }

    // Limpa o input para permitir selecionar o mesmo arquivo novamente se necessário
    event.target.value = "";
  };

  reader.readAsArrayBuffer(file);
}
