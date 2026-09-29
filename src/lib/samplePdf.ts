/**
 * Generates a clean, valid 3-page PDF with rich semantic text (Technical Architecture,
 * Field Exploration, and Philosophical Mind) for instant testing in Vivido without needing a local PDF file.
 */
export function createSamplePdf(): Uint8Array {
  const pagesData = [
    {
      title: "Chapter 1: Cognitive Architecture & Visual Anchors",
      p1: "In modern cognitive psychology, the dual-coding theory suggests that human cognition is split into two distinct subsystems: verbal and non-verbal mental representations.",
      p2: "When a reader encounters complex technical architecture, the working memory experiences cognitive load. An automated visual pipeline ingests the textual representation, identifies key structural nodes, and synthesizes visual memory anchors beside the reading surface.",
      p3: "This distributed system architecture maps data streams into modular translucent blocks, dynamic data conduits, and hierarchical layers. By anchoring key concepts visually, recall accuracy improves by over 400 percent."
    },
    {
      title: "Chapter 2: The Fog of the Thames Expedition",
      p1: "The iron steamship cut quietly through the dense autumn mist hanging over the Thames at dawn. Captain Marcus stood on the bridge, his brass sextant cold against his gloved fingers.",
      p2: "The riverbanks were swallowed by a deep amber luminescence as gas lamps flickered through the morning smog. Wharves and skeletal rigging loomed like ancient leviathans in the stillness.",
      p3: "Behind them, the sprawling city awakened to the rhythmic chime of church bells echoing across the water, marking the beginning of their journey into uncharted southern currents."
    },
    {
      title: "Chapter 3: The Metaphor of the Library of Babel",
      p1: "Every thought conceived by humanity already exists in latent geometric space, waiting to be traversed. The universe is conceived as an indefinite library of hexagonal galleries.",
      p2: "In this philosophical maze, symbols transcend their literal definitions. Mirrors and labyrinths become poignant metaphors for infinite recursion, identity, and the relentless search for elusive absolute truth.",
      p3: "To comprehend such abstractions, the mind must synthesize conceptual emblems—crystallized metaphors that bridge intangible metaphysics with physical intuition."
    }
  ];

  let objId = 1;
  const objects: string[] = [];
  const xref: number[] = [];

  function addObject(content: string): number {
    const id = objId++;
    objects.push(`${id} 0 obj\n${content}\nendobj\n`);
    return id;
  }

  // 1. Catalog
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");

  // Allocate Page IDs
  const page1Id = 3;
  const page2Id = 4;
  const page3Id = 5;
  const fontId = 6;
  const content1Id = 7;
  const content2Id = 8;
  const content3Id = 9;

  // 2. Pages object
  addObject(`<< /Type /Pages /Kids [${page1Id} 0 R ${page2Id} 0 R ${page3Id} 0 R] /Count 3 >>`);

  // Helper for content streams
  function buildContentStream(page: typeof pagesData[0]): string {
    const stream = [
      "BT",
      "/F1 18 Tf",
      "50 720 Td",
      `(${escapePdf(page.title)}) Tj`,
      "/F1 11 Tf",
      "0 -36 Td",
      `(${escapePdf(page.p1)}) Tj`,
      "0 -24 Td",
      `(${escapePdf(page.p2)}) Tj`,
      "0 -24 Td",
      `(${escapePdf(page.p3)}) Tj`,
      "/F1 9 Tf",
      "0 -40 Td",
      "(Vivido Reading System - Demonstration Page) Tj",
      "ET"
    ].join("\n");
    return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  function escapePdf(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  // 3, 4, 5: Page objects
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content1Id} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content2Id} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content3Id} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);

  // 6: Font object (Helvetica Standard 14 font)
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  // 7, 8, 9: Content streams
  addObject(buildContentStream(pagesData[0]));
  addObject(buildContentStream(pagesData[1]));
  addObject(buildContentStream(pagesData[2]));

  // Assemble full PDF
  let pdf = "%PDF-1.4\n";
  const startXref = pdf.length;
  xref.push(0);

  for (const obj of objects) {
    xref.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${xref.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i++) {
    pdf += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${xref.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const encoder = new TextEncoder();
  return encoder.encode(pdf);
}
