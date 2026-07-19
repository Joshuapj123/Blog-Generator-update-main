import { Editor } from '@tiptap/react';

export function highlightWeak(editor: Editor, term: string, category: string) {
  if (!editor || !term) return;

  const { doc } = editor.state;
  // Escape regex special chars in term just in case
  const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexibleTerm = safeTerm.split(/\s+/).join('[\\s\\u00A0]+');
  const regex = new RegExp(`(${flexibleTerm})`, 'gi');
  
  // First clear any existing weak copy highlights to avoid overlapping
  clearWeakHighlights(editor);

  let firstPos = -1;

  editor.commands.command(({ tr }) => {
    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        let match;
        // Need to reset lastIndex since we are reusing the regex or just re-create it locally
        const localRegex = new RegExp(`(${flexibleTerm})`, 'gi');
        while ((match = localRegex.exec(node.text)) !== null) {
          const start = pos + match.index;
          const end = start + match[0].length;
          
          if (firstPos === -1) {
            firstPos = start;
          }

          tr.addMark(
            start, 
            end, 
            editor.schema.marks.weakCopy.create({ category, phrase: term })
          );
        }
      }
    });
    return true;
  });

  // Scroll to first match
  if (firstPos !== -1) {
    editor.chain().setTextSelection(firstPos).scrollIntoView().run();
  }
}

export function clearWeakHighlights(editor: Editor) {
  if (!editor) return;
  
  const { doc } = editor.state;
  
  editor.commands.command(({ tr }) => {
    doc.descendants((node, pos) => {
      if (node.isText) {
        tr.removeMark(pos, pos + node.nodeSize, editor.schema.marks.weakCopy);
      }
    });
    return true;
  });
}

function getPositionsInTextblock(node: any, pos: number, phrase: string) {
  const safeTerm = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexibleTerm = safeTerm.split(/\s+/).join('[\\s\\u00A0]+'); // Handle non-breaking spaces too
  const regex = new RegExp(`(${flexibleTerm})`, 'gi');
  const text = node.textContent;
  const results: {start: number, end: number}[] = [];
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchStartStr = match.index;
    const matchEndStr = matchStartStr + match[0].length;
    
    let currentStrPos = 0;
    let currentDocPos = pos + 1;
    
    let startPos = -1;
    let endPos = -1;
    
    node.forEach((child: any) => {
      const childLen = child.nodeSize; 
      const childTextLen = child.isText ? child.text.length : 0; 
      
      if (startPos === -1 && matchStartStr >= currentStrPos && matchStartStr < currentStrPos + childTextLen) {
        startPos = currentDocPos + (matchStartStr - currentStrPos);
      }
      if (startPos !== -1 && endPos === -1 && matchEndStr > currentStrPos && matchEndStr <= currentStrPos + childTextLen) {
        endPos = currentDocPos + (matchEndStr - currentStrPos);
      }
      
      currentStrPos += childTextLen;
      currentDocPos += childLen;
    });
    
    if (startPos !== -1 && endPos !== -1) {
      results.push({ start: startPos, end: endPos });
    }
  }
  return results;
}

export function highlightAllWeakCopy(editor: Editor, flags: any[]) {
  if (!editor || !flags || flags.length === 0) return;

  const { doc } = editor.state;
  clearWeakHighlights(editor);

  editor.commands.command(({ tr }) => {
    flags.forEach(flag => {
      const term = flag.originalPhrase;
      if (!term) return;

      doc.descendants((node, pos) => {
        if (node.isTextblock) {
          const matches = getPositionsInTextblock(node, pos, term);
          matches.forEach(({ start, end }) => {
            tr.addMark(
              start,
              end,
              editor.schema.marks.weakCopy.create({ category: flag.category || 'passive', phrase: term })
            );
          });
        }
      });
    });
    return true;
  });
}

export function scrollToWeakTerm(editor: Editor, term: string) {
  if (!editor || !term) return;

  const { doc } = editor.state;
  let firstPos = -1;

  doc.descendants((node, pos) => {
    if (firstPos !== -1) return false;
    if (node.isTextblock) {
      const matches = getPositionsInTextblock(node, pos, term);
      if (matches.length > 0) {
        firstPos = matches[0].start;
      }
    }
  });

  if (firstPos !== -1) {
    editor.chain().setTextSelection(firstPos).run();
    
    try {
      // Find the DOM node corresponding to the position
      const domData = editor.view.domAtPos(firstPos);
      let targetNode = domData.node;
      
      // If it's a text node, use its parent element for scrolling
      if (targetNode.nodeType === Node.TEXT_NODE) {
        targetNode = targetNode.parentElement!;
      }
      
      if (targetNode instanceof Element) {
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Optional: add a quick pulse effect to the element to draw the eye
        const originalTransition = (targetNode as HTMLElement).style.transition;
        const originalBg = (targetNode as HTMLElement).style.backgroundColor;
        
        (targetNode as HTMLElement).style.transition = 'background-color 0.3s ease';
        (targetNode as HTMLElement).style.backgroundColor = 'rgba(139, 92, 246, 0.2)'; // violet-500 with opacity
        
        setTimeout(() => {
          (targetNode as HTMLElement).style.backgroundColor = originalBg;
          setTimeout(() => {
            (targetNode as HTMLElement).style.transition = originalTransition;
          }, 300);
        }, 1500);
      }
    } catch (e) {
      // Fallback
      editor.chain().scrollIntoView().run();
    }
  }
}

export function applyWeakCopyFix(editor: Editor, term: string, suggestedRewrite: string) {
  if (!editor || !term || !suggestedRewrite) return;

  const { doc } = editor.state;
  let firstStart = -1;
  let firstEnd = -1;

  doc.descendants((node, pos) => {
    if (firstStart !== -1) return false;
    if (node.isTextblock) {
      const matches = getPositionsInTextblock(node, pos, term);
      if (matches.length > 0) {
        firstStart = matches[0].start;
        firstEnd = matches[0].end;
      }
    }
  });

  if (firstStart !== -1 && firstEnd !== -1) {
    editor.chain()
      .setTextSelection({ from: firstStart, to: firstEnd })
      .insertContent(suggestedRewrite)
      .run();
  }
}
