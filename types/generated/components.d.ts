import type { Attribute, Schema } from '@strapi/strapi';

export interface VariantVariant extends Schema.Component {
  collectionName: 'components_variant_variants';
  info: {
    displayName: 'Variant';
  };
  attributes: {
    color: Attribute.String;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'variant.variant': VariantVariant;
    }
  }
}
