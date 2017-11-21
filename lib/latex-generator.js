/*jshint esversion: 6, node: true, maxlen: 120 */

//latex generator doesn't seem to be able to produce compilable code atm
module.exports = (obj) => {
  //add setup and some data
  var str = `
  \\newcommand{\\forum}{${obj.resolution.address.forum}}
  \\newcommand{\\issue}{${obj.resolution.address.questionOf}}
  \\newcommand{\\sponsor}{${obj.resolution.address.sponsor.main}}
  \\begin{tabbing}
      FORUM: \\quad \\quad  \\quad \\quad\\=\\forum \\\\
      \\\\
      QUESTION OF: \\>\\issue \\\\
      \\\\
      SPONSOR: \\>\\sponsor \\\\
  \\end{tabbing}
  \\MakeUppercase{THE \\forum},`;
  
  //preambs
  str += "\n" + obj.resolution.clauses.preambulatory.map(
    (clause) => {
      //add code for clause and all subclauses
      let str = `\\begin{preamb}{${clause.phrase}}{${clause.content}}\\end{preamb}`;
      if (clause.hasOwnProperty("sub")) {
        str += "\\begin{preambsubclause}\n";
        str += clause.sub.map((sub) => "\\item " + sub).join("\n");
        str += "\n\\end{preambsubclause}";
      }

      //extensions not yet suppored by the template

      //return created clause
      return str;
    }
  ).join("\n");
  
  
  //ops
  if (obj.resolution.clauses.operative.length) {
    str += "\\begin{enumerate}[1., align = left, leftmargin =* , " +
      "widest* = 8, labelindent=0cm, labelsep=1cm, topsep=0pt]\n" + obj.resolution.clauses.operative.map(
      //generate code for clause, subclauses of any levels not yet supported
      (clause) => `\\begin{oc}{${clause.phrase}}{${clause.content}}\\end{oc}`

      //extensions not yet suppored by the template
    ).join("\n") + "\n\\end{enumerate}";
  }

  return str;
};
