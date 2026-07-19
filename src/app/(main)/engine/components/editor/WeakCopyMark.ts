import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    weakCopy: {
      setWeakCopy: (attributes: { category: string; phrase?: string }) => ReturnType;
      unsetWeakCopy: () => ReturnType;
    }
  }
}

export const WeakCopyMark = Mark.create({
  name: 'weakCopy',

  addAttributes() {
    return {
      category: {
        default: 'passive',
        parseHTML: element => element.getAttribute('data-weak-category'),
        renderHTML: attributes => {
          return {
            'data-weak-category': attributes.category,
            class: `weak-highlight weak-${attributes.category}`,
          }
        },
      },
      phrase: {
        default: null,
      }
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-weak-copy]' }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-weak-copy': '' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setWeakCopy: attributes => ({ commands }) => {
        return commands.setMark(this.name, attributes)
      },
      unsetWeakCopy: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      },
    }
  },
});
