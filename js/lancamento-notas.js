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
  
  // ⭐ NOVO: Aplicar destaque nas notas após carregar
  setTimeout(() => {
    destacarTodasNotas();
  }, 100);
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

  // Busca as disciplinas da turma no banco ANTES de abrir o arquivo
  // (precisa ser aqui pois o reader.onload não é async)
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

  // Função de matching: compara por igualdade ou prefixo (para nomes truncados)
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

      // 1. Encontrar a linha de cabeçalho (procurar "ALUNO" na primeira coluna)
      let headerRowIndex = -1;
      const alunoColIndex = 0;

      for (let i = 0; i < json.length; i++) {
        if (compararTextos(json[i][0], "ALUNO")) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert("Não foi possível encontrar a célula 'ALUNO' na primeira coluna do arquivo.");
        return;
      }

      // 2. Encontrar a coluna da disciplina usando matching por prefixo
      // O mapão trunca nomes longos (ex: "LÓGICA E LINGUAGEM DE PROGRAMA" em vez do nome completo)
      // disciplinasBanco foi carregado antes do reader.onload para evitar await dentro do callback

      // Tenta encontrar qual disciplina do banco corresponde à disciplina atual
      // Primeiro tenta exato, depois por prefixo
      let disciplinaAlvo = disciplinaNome;
      if (disciplinasBanco.length > 0) {
        const match = disciplinasBanco.find(d => matchDisciplina(disciplinaNome, d) || matchDisciplina(d, disciplinaNome));
        if (match) disciplinaAlvo = match;
      }

      const headerRow = json[headerRowIndex];
      let discColIndex = -1;

      // O XLSX.js expande células mescladas repetindo o valor em todas as colunas do merge.
      // Isso pode causar falsos positivos se encontrarmos a disciplina errada primeiro.
      // Estratégia: varrer apenas células únicas (pular duplicatas consecutivas)
      // e escolher o match com maior sobreposição de texto (melhor match).
      let melhorMatchTamanho = 0;
      let ultimaCelula = null;

      for (let j = 0; j < headerRow.length; j++) {
        const cellValor = String(headerRow[j] ?? "").split("\n")[0].trim();

        // Pular células duplicadas do merge (mesmo valor que a anterior)
        if (cellValor === ultimaCelula) continue;
        ultimaCelula = cellValor;

        if (!cellValor) continue;

        const nm = normalizarTexto(cellValor);
        const nd = normalizarTexto(disciplinaAlvo);

        // Calcula o tamanho do prefixo comum
        const prefixoComum = Math.min(nm.length, nd.length);
        const faz_match = nd.startsWith(nm) || nm.startsWith(nd);

        if (faz_match && prefixoComum > melhorMatchTamanho) {
          melhorMatchTamanho = prefixoComum;
          discColIndex = j;
        }
      }

      if (discColIndex === -1) {
        alert(`Disciplina "${disciplinaNome}" não encontrada na linha de cabeçalho do arquivo.`);
        return;
      }

      // 3. Identificar o range da célula mesclada da disciplina
      let endColIndex = discColIndex;
      if (sheet['!merges']) {
        const merge = sheet['!merges'].find(m => m.s.r === headerRowIndex && m.s.c === discColIndex);
        if (merge) endColIndex = merge.e.c;
      }

      // 4. Encontrar as colunas "M" (Média) e "F" (Faltas) na linha abaixo
      const subHeaderRow = json[headerRowIndex + 1];
      let mediaColIndex = -1;
      let faltasColIndex = -1;

      if (subHeaderRow) {
        for (let c = discColIndex; c <= endColIndex; c++) {
          if (compararTextos(subHeaderRow[c], "M") && mediaColIndex === -1) {
            mediaColIndex = c;
          } else if (compararTextos(subHeaderRow[c], "F") && mediaColIndex !== -1 && faltasColIndex === -1) {
            // A coluna F vem logo após a M dentro do bloco da disciplina
            faltasColIndex = c;
          }
        }

        // Fallback: se não achou "F" no range, tenta a coluna imediatamente após a média
        if (mediaColIndex !== -1 && faltasColIndex === -1) {
          faltasColIndex = mediaColIndex + 1;
        }
      }

      if (mediaColIndex === -1) {
        alert("Coluna 'M' (Média) não encontrada abaixo da disciplina.");
        return;
      }

      // 5. Preencher os inputs com as notas e faltas encontradas
		let notasPreenchidas = 0;
		const rowsHtml = document.querySelectorAll("#corpoTabela tr");
		
		for (let r = headerRowIndex + 2; r < json.length; r++) {
		  const rowData = json[r];
		  const nomeExcel = rowData[alunoColIndex];
		
		  if (nomeExcel && typeof nomeExcel === "string") {
		    rowsHtml.forEach(tr => {
		      const nomeHtml = tr.querySelector(".col-aluno")?.innerText;
		      const inputMedia = tr.querySelector(".media");
		      const inputFaltas = tr.querySelector(".faltas");
		
		      if (nomeHtml && inputMedia && compararTextos(nomeHtml, nomeExcel)) {
		
		        // Média
		        const notaExcel = rowData[mediaColIndex];
		        if (notaExcel !== undefined && notaExcel !== null && notaExcel !== "") {
		          const notaFormatada = String(notaExcel).replace(",", ".");
		          const valorFloat = parseFloat(notaFormatada);
		
		          if (!isNaN(valorFloat)) {
		            inputMedia.value = valorFloat;
		            aplicarDestaqueNota(inputMedia, valorFloat);
		            notasPreenchidas++;
		          }
		        }
		
		        // Faltas
		        if (inputFaltas && faltasColIndex !== -1) {
		          const faltaExcel = rowData[faltasColIndex];
		          const faltaStr = String(faltaExcel ?? "").trim();
		
		          if (faltaStr === "-" || faltaStr === "") {
		            inputFaltas.value = 0;
		          } else {
		            const faltaFormatada = faltaStr.replace(",", ".");
		            const faltaFloat = parseFloat(faltaFormatada);
		
		            if (!isNaN(faltaFloat)) {
		              inputFaltas.value = faltaFloat;
		              aplicarDestaqueFalta(inputFaltas, faltaFloat);
		            }
		          }
		        }
		      }
		    });
		  }
		}
		
		if (notasPreenchidas > 0) {
		  alert(`Sucesso! ${notasPreenchidas} notas e faltas foram importadas do Mapão.`);
		
		  const contagem = contarNotasBaixas();
		
		  if (contagem.total > 0) {
		    alert(
		      `⚠️ Atenção: ${contagem.total} aluno(s) com nota abaixo de 5!`
		    );
		  }
		
		} else {
		  alert("Nenhuma nota foi preenchida. Verifique se os nomes dos alunos correspondem.");
		}

    } catch (err) {
      console.error(err);
      alert("Erro ao processar o arquivo.");
    }

    event.target.value = "";
  };

  reader.readAsArrayBuffer(file);
}
