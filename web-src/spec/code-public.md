# SeCuida Code Público

Edição web independente do SeCuida Code para instalação em um WordPress próprio. A edição é distribuída em um único plugin com frontend, API e ajuda. A fonte independente para GitHub contém o plugin, o frontend Expo, o executor opcional, dados de exemplo e testes sintéticos. A origem de comportamento é a edição Code existente e as specs code.md, game.md e event-ops.md lidas no projeto de origem. O objeto principal continua sendo o evento. Não há projetos de editor, launcher, agentes, APK ou serviços SeCuida neste produto.

## Integração

- URL canônica gerada pelo WordPress, com suporte a instalação em subpasta e links permanentes simples. O shortcode [secuida_code_public] coloca a entrada do app em uma página pública. Ajuda embutida e índice de manuais para alunos e professores.
- Login, cadastro quando habilitado, recuperação de senha e logout usam as páginas nativas do WordPress. A API aceita apenas a sessão do WordPress com nonce REST e verifica as capacidades e os vínculos já exigidos por evento. Sem sessão paralela. Administrador aprova professores na aba de Administração do app.
- O plugin usa prefixos próprios na API, PHP, metadados, banco e cache. Instalação vazia, sem migração ou cópia de contas, eventos ou dados da edição original. Os dados ficam no banco desta instalação. Exportação e exclusão de dados do Code ficam na Conta. A conta WordPress segue o fluxo do site.
- Modelos Google, NVIDIA e OpenAI permanecem disponíveis com a chave pessoal cifrada no banco. O WordPress faz todas as chamadas aos provedores. Vereditos e pontos usam somente respostas de provedor obtidas no servidor ou revisão de professor autorizada. Pistas de rascunhos locais enviam o texto atual ao WordPress e ao provedor selecionado, sem gravar o rascunho como tentativa. Os testes do aluno continuam declarados pelo cliente.
- Python e JavaScript no navegador continuam com a superfície isolada existente. Para C, C++ e Java, o executor opcional requer Python 3 e as ferramentas locais. A instalação recebe um ZIP leve com o código e instruções. Origem do servidor configurada explicitamente no executor. Executar somente código confiável, pois o executor local herda as permissões do usuário.

## Entrega e verificação

ZIP WordPress com bundle web e binário do executor gerado de fontes. ZIP de fontes separado com fluxo de build e sem arquivos de produção. Validar build, testes PHP e TypeScript, arquivos do ZIP, URLs para subpasta e links simples, acesso por perfil e ausência de URLs, dumps, credenciais ou capturas internas. Nomes controlados com até 30 caracteres, sem colisões por caixa. A exceção literal é sc_vector_db e seus descendentes.


## Verificação da versão 1.0.0

Os testes PHP usam usuários, chaves e respostas de provedor fictícios. São
testadas a autorização por evento, a fila de avaliação, a impossibilidade de
registrar um parecer fornecido pelo navegador e a recuperação após falha de
gravação. Os testes TypeScript/Node cobrem rascunhos, entregas e prazos.
A verificação de integração usa WordPress local com banco de teste em SQLite.
A distribuição e os requisitos de hospedagem estão no README do plugin.
