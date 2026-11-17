# SeCuida Code Público

Eventos, equipes, desafios e treino de programação, com editor, ranking,
acompanhamento de turma, avaliação e tutor de IA. A edição pública funciona
como um único plugin em um WordPress próprio.

## Instalar

1. Faça upload do ZIP de instalação no WordPress e ative o plugin.
2. Coloque o shortcode `[secuida_code_public]` em uma página. Ele incorpora
   o app e oferece um link de tela cheia. O endereço direto é
   `/?sc_code_public=1` a partir da raiz do site.
3. Entre com uma conta administradora do WordPress. No app, crie seu primeiro
   evento, adicione desafios e compartilhe o código após publicar.
4. Para permitir que participantes criem conta, habilite o cadastro nas
   configurações do próprio WordPress. Cada administrador ou professor
   autorizado usa sua conta do site. Pedidos de professor aparecem na aba
   **Administração** do Code.

Use WordPress 6.5 ou superior, PHP 8.1 ou superior com OpenSSL e mbstring,
MySQL ou MariaDB com InnoDB, e HTTPS. Configure o envio de email do WordPress
para cadastro e recuperação de senha. A instalação funciona em subpastas e
com links permanentes simples. Os arquivos web do plugin precisam estar
acessíveis pelo servidor. Em cache de página ou CDN, mantenha fora do cache
o documento `?sc_code_public=1` e a API `sc-code-public/v1`.

## IA, dados e execução

O cadastro de chaves fica em **Minha IA**. Cada pessoa usa sua conta no provedor.
O WordPress guarda a chave cifrada com os segredos da instalação e faz as
consultas a Google Gemini, NVIDIA ou OpenAI. O texto enviado pode incluir
enunciado, código e resultados de teste. A avaliação inicial usa o retorno do
provedor conferido pelo servidor. A revisão do professor permanece disponível.
A saída executada no computador do participante é evidência declarada.

Python no navegador usa Pyodide do jsDelivr. JavaScript no navegador e Python
funcionam dentro de uma página de execução com origem opaca. O executor
opcional para outras linguagens está na aba **Executor**. Ele requer Python 3.11+
e ferramentas locais. Execute código de terceiros dentro de um ambiente
isolado pelo sistema operacional.

Exportação e exclusão dos dados do Code ficam em **IA e conta → Meus dados**.
Desativar ou remover o plugin preserva os dados do banco para reinstalação.
A conta do WordPress e o tratamento dos dados do site são administrados na
própria instalação. Esta edição começa com a própria base, sem registros da
edição original.

## Compilar a partir das fontes

Use Node.js 22, npm, Python 3.11+ e, para testes PHP, PHP com PDO SQLite,
mbstring e OpenSSL. Dentro do repositório de fontes, rode:

```sh
python3 release.py
```

O script roda a checagem TypeScript e os testes, compila a interface e gera
`zips/sc-code-public.zip` e `zips/sc-code-public-src.zip`. Para instalar, use
o primeiro ZIP. Para iniciar um repositório GitHub separado, extraia o segundo.
O diretório `web-src/` contém o frontend compilável e a pasta `executor/`
contém as fontes do programa opcional. O ZIP de instalação inclui os avisos
de licenças encontrados nas dependências usadas para o build.
