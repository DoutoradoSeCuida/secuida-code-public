# Executor do SeCuida Code Público

Instale Python 3.11 ou mais recente e extraia o ZIP inteiro. Abra o terminal nesta
pasta e execute um dos comandos, trocando a origem pelo endereço do seu site.
Use só o protocolo, o domínio e a porta, mesmo se o WordPress estiver em uma subpasta.

- Windows `py -3 executor.pyz --origin https://escola.example`
- macOS/Linux `python3 executor.pyz --origin https://escola.example`

O programa mostra um código de conexão dentro da janela ou do terminal. Copie o
código inteiro para a aba Executor no app. Use a chave nova ao reiniciar o programa.
Em sistemas sem interface gráfica, acrescente `--no-ui`.

Python e JavaScript também rodam no navegador. Para rodar C ou C++, instale um
compilador compatível no PATH do computador. Java exige JDK e JavaScript local
exige Node.js. O executor anuncia as ferramentas que detectar.

O executor aceita chamadas no endereço de loopback, da origem informada e
com o código temporário. Os programas, por sua vez, rodam com as permissões
da sua conta e podem acessar arquivos e rede. Use só código confiável ou execute
em ambiente com isolamento controlado pelo sistema operacional.
