import { AIProvider, AIProviderType } from './aiProvider';
import { providerGateway } from './providerGateway';

export class ProviderFactory {
  public static getProvider(type?: AIProviderType): AIProvider {
    if (type) {
      return providerGateway.getProvider(type);
    }
    const configured = (process.env.AI_PROVIDER || 'mock').toLowerCase();
    if (configured === 'openai' || configured === 'external') {
      return providerGateway.getProvider('external');
    }
    if (configured === 'ollama' || configured === 'local') {
      return providerGateway.getProvider('local');
    }
    if (configured === 'ezrab_core') {
      return providerGateway.getProvider('ezrab_core');
    }
    return providerGateway.getProvider('mock');
  }
}
