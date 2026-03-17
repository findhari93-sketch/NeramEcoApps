import NataSpokeNavWrapper from '@/components/nata/NataSpokeNavWrapper';

export default function NataLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NataSpokeNavWrapper />
      {children}
    </>
  );
}
