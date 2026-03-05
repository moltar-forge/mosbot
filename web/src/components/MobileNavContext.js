import { createContext, useContext } from 'react';

// Context to provide mobile nav toggle to any descendant (Header, inline headers, etc.)
const MobileNavContext = createContext(null);

export function useMobileNav() {
  return useContext(MobileNavContext);
}

export default MobileNavContext;
