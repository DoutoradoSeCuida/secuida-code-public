import { router } from 'expo-router';
import { useCode } from '../../src/providers/CodeProvider';
import { Page,Notice } from '../../src/components/Page';
import { Monitor } from '../../src/components/Monitor';
export default function Monitoring(){const {detail}=useCode();return <Page title="Acompanhar evento" subtitle={detail?.event.data.title} help="monitor#matrix" back={()=>router.replace('/')} compact>{detail?<Monitor wide key={detail.event.id} eventId={detail.event.id}/>:<Notice text="Aceite um convite ou selecione seu evento para acompanhar."/>}</Page>;}
