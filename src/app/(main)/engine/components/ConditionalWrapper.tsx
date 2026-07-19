import React from 'react';

export function ConditionalWrapper({ condition, wrapper, children }: { condition: boolean, wrapper: (c: React.ReactNode) => React.ReactNode, children: React.ReactNode }) {
  return condition ? (wrapper(children) as React.ReactElement) : <>{children}</>;
}
