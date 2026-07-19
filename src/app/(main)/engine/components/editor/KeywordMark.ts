import { Mark, mergeAttributes } from '@tiptap/core';

export interface KeywordOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    keyword: {
      setKeyword: (attributes: { category: string }) => ReturnType;
      toggleKeyword: (attributes: { category: string }) => ReturnType;
      unsetKeyword: () => ReturnType;
    }
  }
}

export const KeywordMark = Mark.create<KeywordOptions>({
  name: 'keyword',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      category: {
        default: 'core',
        parseHTML: element => element.getAttribute('data-category'),
        renderHTML: attributes => {
          if (!attributes.category) {
            return {};
          }
          return {
            'data-category': attributes.category,
            class: `keyword-highlight keyword-${attributes.category}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-keyword]',
      },
      {
        tag: 'span.keyword-highlight',
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-keyword': '' }, this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setKeyword: attributes => ({ commands }) => {
        return commands.setMark(this.name, attributes)
      },
      toggleKeyword: attributes => ({ commands }) => {
        return commands.toggleMark(this.name, attributes)
      },
      unsetKeyword: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      },
    }
  },
});
