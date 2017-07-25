/*jshint asi: false, esnext: true, node: true, indent: 2*/
module.exports = (obj) => {
  //add setup and some data
  var str = `
    \\documentclass[12pt, a4paper]{scrartcl}
    \\usepackage[english]{babel}
    \\usepackage[utf8]{inputenc}
    \\usepackage[T1]{fontenc}
    \\usepackage{lastpage}
    \\usepackage{fancyhdr}
    \\usepackage{paralist}
    \\usepackage{enumerate}
    \\usepackage[shortlabels]{enumitem}
    \\usepackage{soul}
    \\usepackage{mfirstuc}
    \\usepackage{xstring}
    \\pagestyle{fancy}
    \\fancyhf{}
    \\rhead{Page \\thepage\\ of \\pageref{LastPage}}
    \\renewcommand{\\headrulewidth}{0pt}
    \\setlength\\parindent{0pt}
    \\newenvironment{preamb}[2]{
    \\vspace*{1em}
    \\StrLeft{#1}{1}[\\firstletter]%
    \\StrBehind{#1}{\\firstletter}[\\rest]%
    \\StrRight{#2}{1}[\\lastletter]%
    \\emph{\\capitalisewords{\\firstletter}\\rest}
    #2%
    }{%
    \\IfStrEq{\\lastletter}{:}{}{,}%
     }
    \\newenvironment{oc}[2]{\\item %
    \\StrLeft{#1}{1}[\\firstletter]%
    \\StrBehind{#1}{\\firstletter}[\\rest]%
    \\StrRight{#2}{1}[\\lastletter]%
    \\underline{\\capitalisewords{\\firstletter}\\rest}
    #2%
    }
    {%
    \\IfStrEq{\\lastletter}{.}{}{;}%
    }
    \\newenvironment{preambsubclause}{ \\begin{itemize}[leftmargin=*,labelindent=2.5em,labelsep=2em] {} %
    \\renewcommand\\labelitemi{-}
    \\vspace*{-.8em}%
    \\setlength{\\itemsep}{0pt}%
    \\setlength{\\parskip}{0pt}%
    \\setlength{\\parsep}{0pt}%
    }{
        \\end{itemize}
    }
    \\begin{document}
    \\newcommand{\\forum}{${obj.resolution.address.forum}}
    \\newcommand{\\issue}{${obj.resolution.address.questionOf}}
    \\newcommand{\\sponsor}{${obj.resolution.address.sponsor.main}
    \\begin{tabbing}
        FORUM: \\quad \\quad  \\quad \\quad\\=\\forum \\\\
        \\\\
        QUESTION OF: \\>\\issue \\\\
        \\\\
        SPONSOR: \\>\\sponsor \\\\
    \\end{tabbing}
    \\MakeUppercase{\\forum},
    \\\\\\\\`;

  //preambs
  str += "\n" + obj.resolution.clauses.preambulatory.map(
    (clause) => {
      //add code for clause and all subclauses
      let str = `\\begin{preamb}{${clause.phrase}}{${clause.content}}\\end{preamb}`;
      if (clause.hasOwnProperty("sub")) {
        str += "\\begin{preambsubclause}\n";
        clause.sub.map((sub) => "\\item " + sub).join("\n");
        str += "\n\\end{preambsubclause}";
      }

      //extensions not yet suppored by the template

      //return created clause
      return str;
    }
  ).join("\n");

  //ops
  if (obj.resolution.clauses.operative.length) {
    str += "\n\\begin{enumerate}[1., align = left, leftmargin =* , " +
      "widest* = 8, labelindent=0cm, labelsep=1cm]\n" + obj.resolution.clauses.operative.map(
      //generate code for clause, subclauses of any levels not yet supported
      (clause) => `\\begin{oc}{${clause.phrase}}{${clause.content}}\\end{oc}`

      //extensions not yet suppored by the template
    ).join("\n") + "\n\\end{enumerate}";
  }

  console.log(str);
  //return finished document
  return str + "\n\\end{document}";
};
