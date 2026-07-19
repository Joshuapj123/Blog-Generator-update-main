import { Editor } from '@tiptap/react';

export function applyKeywordHighlights(editor: Editor, serpTerms: { keyword: string; category: string }[]) {
  if (!editor || !serpTerms || serpTerms.length === 0) return;

  const { doc } = editor.state;

  editor.commands.command(({ tr }) => {
    // Clear existing keyword marks first to avoid duplicates
    doc.descendants((node, pos) => {
      if (node.isText) {
        tr.removeMark(pos, pos + node.nodeSize, editor.schema.marks.keyword);
      }
    });

    serpTerms.forEach(termObj => {
      const { keyword, category } = termObj; // expecting 'core' | 'expansion' | 'long-tail' | 'competitor'
      if (!keyword) return;
      
      const safeTerm = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b(${safeTerm})\\b`, 'gi');
      
      doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          let match;
          while ((match = regex.exec(node.text)) !== null) {
            const start = pos + match.index;
            const end = start + match[0].length;
            
            tr.addMark(
              start, 
              end, 
              editor.schema.marks.keyword.create({ category: category || 'core' })
            );
          }
        }
      });
    });

    return true;
  });
}
