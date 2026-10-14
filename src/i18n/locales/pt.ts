import type en from './en.ts'

const pt: typeof en = {
  app: { name: 'rendermd', tagline: 'Cole Markdown, compartilhe um link renderizado.' },
  editor: {
    code: 'Código',
    preview: 'Preview',
    placeholder: 'Cole ou digite Markdown aqui. Diagramas Mermaid, fórmulas e blocos de código são suportados.',
    generate: 'Gerar link',
    generating: 'Gerando…',
    copied: 'Link copiado para a área de transferência.',
    copyManually: 'Copie o link abaixo.',
    shareUrl: 'Link de compartilhamento',
    empty: 'Nada para mostrar ainda.',
  },
  reader: {
    editCopy: 'Editar uma cópia',
    loading: 'Carregando documento…',
    toc: 'Sumário',
    replaceDraft: 'Substituir o rascunho atual do editor por este documento?',
  },
  export: {
    pdf: 'Exportar PDF',
    md: 'Baixar .md',
    svg: 'SVG',
    png: 'PNG',
    diagramActions: 'Baixar diagrama',
  },
  qr: {
    button: 'QR code',
    alt: 'QR code do link',
    tooLong: 'Este link é longo demais para um QR code.',
  },
  theme: { dark: 'Tema escuro', light: 'Tema claro' },
  lang: { switchTo: 'English' },
  errors: {
    corrupt:
      'Este link parece incompleto. Apps de mensagem às vezes cortam links longos; peça para quem enviou gerar de novo.',
    expired: 'Este documento expirou. Documentos grandes pouco acessados são removidos quando o espaço enche.',
    network: 'Não foi possível carregar o documento agora.',
    unknownFormat: 'Este link foi criado por uma versão mais nova do rendermd. Recarregue a página.',
    storageUnavailable:
      'Não foi possível salvar o documento, então o link leva o documento inteiro. Alguns apps cortam links longos.',
    generateFailed: 'Não foi possível gerar o link. Tente de novo.',
    tooLarge: 'Este documento é grande demais para compartilhar por link. Baixe o .md ou exporte um PDF.',
    diagram: 'Não foi possível renderizar este diagrama:',
    png: 'Este diagrama não pode ser exportado como PNG neste navegador. Baixe o SVG.',
    loadFailed: 'Não foi possível carregar o que este bloco precisa.',
  },
  common: { retry: 'Tentar de novo' },
}

export default pt
