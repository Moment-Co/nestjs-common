import { Test, TestingModule } from '@nestjs/testing';
import { PubSubHealthModule } from '../../src/health/providers/pubsub-health.module';
import { HEALTH_PUBSUB_CLIENT } from '../../src/health/checks/pubsub.health';

function isPubSubResolvable(): boolean {
  try {
    require.resolve('@google-cloud/pubsub');
    return true;
  } catch {
    return false;
  }
}

describe('PubSubHealthModule', () => {
  const prevGcp = process.env.GCP_PROJECT_ID;
  const prevGoogle = process.env.GOOGLE_CLOUD_PROJECT;

  afterEach(() => {
    if (prevGcp === undefined) delete process.env.GCP_PROJECT_ID;
    else process.env.GCP_PROJECT_ID = prevGcp;
    if (prevGoogle === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = prevGoogle;
  });

  it('register() provides undefined client when no project id', async () => {
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PubSubHealthModule.register()],
    }).compile();

    expect(moduleRef.get(HEALTH_PUBSUB_CLIENT)).toBeUndefined();
  });

  it('register({ projectId }) provides PubSub when @google-cloud/pubsub is installed', async () => {
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const moduleRef = await Test.createTestingModule({
      imports: [PubSubHealthModule.register({ projectId: 'test-project' })],
    }).compile();

    const client = moduleRef.get(HEALTH_PUBSUB_CLIENT);
    if (isPubSubResolvable()) {
      expect(client).toBeDefined();
      expect((client as { projectId?: string }).projectId).toBe('test-project');
    } else {
      expect(client).toBeUndefined();
    }
  });

  it('uses GOOGLE_CLOUD_PROJECT when GCP_PROJECT_ID is unset', async () => {
    delete process.env.GCP_PROJECT_ID;
    process.env.GOOGLE_CLOUD_PROJECT = 'only-google';

    const moduleRef = await Test.createTestingModule({
      imports: [PubSubHealthModule.register()],
    }).compile();

    const client = moduleRef.get(HEALTH_PUBSUB_CLIENT);
    if (isPubSubResolvable()) {
      expect(client).toBeDefined();
      expect((client as { projectId?: string }).projectId).toBe('only-google');
    } else {
      expect(client).toBeUndefined();
    }
  });
});
