import { Text, View } from 'react-native';
import { Page, ui } from '../components/Page';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { accountPage, site } from '../lib/site';

export function AuthScreen() {
  const { loginUrl, registerUrl, resetUrl } = site();
  return <Page title="Seu próximo desafio começa aqui" subtitle="Treine programação, participe de eventos e acompanhe sua evolução." help="account#access">
    <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
      <Card>
        <Text style={ui.text}>Use sua conta deste site para acessar o SeCuida Code Público.</Text>
        <PrimaryButton label="Entrar com WordPress" onPress={() => accountPage(loginUrl)} />
        <PrimaryButton label="Esqueci minha senha" variant="secondary" onPress={() => accountPage(resetUrl)} />
        {registerUrl ? <PrimaryButton label="Criar conta" variant="secondary" onPress={() => accountPage(registerUrl)} /> : null}
        <Text style={ui.muted}>Para participar, peça ao professor o código do evento.</Text>
      </Card>
    </View>
  </Page>;
}
