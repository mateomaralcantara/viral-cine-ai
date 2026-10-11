import type { Metadata } from 'next';
import V8Scene2Control from './V8Scene2Control';

export const metadata:Metadata={
 title:'ViralCine V8 | Director de producción',
 description:'Control visual de Runway, créditos y las siete tomas E02. Solo frontend.'
};
export default function V8Page(){return <V8Scene2Control/>;}
