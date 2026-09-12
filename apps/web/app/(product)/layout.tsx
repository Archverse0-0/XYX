import { Providers } from '../providers';
import { ProductShell } from '../../components/product/ProductShell';
import { ConfigurationNotice } from '../../components/product/ConfigurationNotice';
import '../../styles/product.css';

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell>{process.env.NEXT_PUBLIC_PRIVY_APP_ID
    ? <Providers>{children}</Providers>
    : <ConfigurationNotice/>}</ProductShell>;
}
