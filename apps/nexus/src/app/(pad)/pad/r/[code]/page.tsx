import BrowserPadApp from '@/components/answer-pad/BrowserPadApp';

/** A room code link such as /pad/r/482913: joins straight away once signed in. */
export default function AnswerPadRoomPage({ params }: { params: { code: string } }) {
  return <BrowserPadApp code={params.code.replace(/\D/g, '').slice(0, 6)} />;
}
