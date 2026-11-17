import { router } from 'expo-router';
import { Page } from '../../src/components/Page';
import { EventRules } from '../../src/components/EventRules';
export default function Rules(){return <Page title="Regras do evento" help="train#rules" back={()=>router.back()}><EventRules/></Page>;}
