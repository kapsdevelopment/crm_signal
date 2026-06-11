import 'dart:convert';

import 'package:crm_app/src/crm/data/api_crm_store.dart';
import 'package:crm_app/src/crm/domain/crm_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('loads workspace data from the CRM API contract', () async {
    final requests = <String>[];
    final client = CrmApiClient(
      baseUrl: Uri.parse('http://crm.local'),
      tenantSlug: 'local-demo',
      httpClient: MockClient((request) async {
        requests.add('${request.method} ${request.url.path}');
        expect(request.headers['x-tenant-slug'], 'local-demo');

        if (request.method == 'GET' && request.url.path == '/crm/accounts') {
          return _json({
            'data': [_accountSummary],
          });
        }

        if (
          request.method == 'GET' &&
          request.url.path == '/crm/accounts/account-1'
        ) {
          return _json({'data': _accountDetail});
        }

        if (request.method == 'GET' && request.url.path == '/crm/signals') {
          return _json({
            'data': [_openSignal, _linkedSignal],
          });
        }

        return http.Response('not found', 404);
      }),
    );
    final store = ApiCrmStore(client: client);

    await store.load();

    expect(requests, [
      'GET /crm/accounts',
      'GET /crm/accounts/account-1',
      'GET /crm/signals',
    ]);
    expect(store.accounts.single.name, 'Nordic Field Systems AS');
    expect(store.accounts.single.roles, [
      AccountRole.prospect,
      AccountRole.partner,
    ]);
    expect(store.contactsForAccount('account-1').single.email, 'a@example.no');
    expect(store.dealsForAccount('account-1').single.stage, DealStage.proposal);
    expect(store.activitiesForAccount('account-1').single.type, 'Oppgave');
    expect(store.notesForAccount('account-1').single.author, 'Ken');
    expect(store.signals.first.status, SignalStatus.newSignal);
    expect(store.signalsForAccount('account-1').single.status, SignalStatus.linked);
  });

  test('creates an account from a signal through the CRM API', () async {
    String? postedBody;
    final client = CrmApiClient(
      baseUrl: Uri.parse('http://crm.local/api'),
      tenantSlug: 'local-demo',
      httpClient: MockClient((request) async {
        if (
          request.method == 'POST' &&
          request.url.path == '/api/crm/accounts/from-signal'
        ) {
          postedBody = request.body;
          return _json({'data': _accountDetail}, statusCode: 201);
        }

        if (request.method == 'GET' && request.url.path == '/api/crm/signals') {
          return _json({
            'data': [_linkedSignal],
          });
        }

        return http.Response('not found', 404);
      }),
    );
    final store = ApiCrmStore(client: client);

    final account = await store.createAccountFromSignal('signal-1');

    expect(postedBody, '{"signalId":"signal-1"}');
    expect(account.id, 'account-1');
    expect(store.accountById('account-1')?.name, 'Nordic Field Systems AS');
    expect(store.signals.single.status, SignalStatus.linked);
  });
}

http.Response _json(Object value, {int statusCode = 200}) {
  return http.Response(
    value is String ? value : jsonEncode(value),
    statusCode,
    headers: {'content-type': 'application/json'},
  );
}

const _accountSummary = {
  'id': 'account-1',
  'organizationId': 'org-1',
  'orgnr': '923456789',
  'name': 'Nordic Field Systems AS',
  'municipalityName': 'Oslo',
  'naceCode': '62.010',
  'naceDescription': 'Programmeringstjenester',
  'roles': ['prospect', 'partner'],
  'ownerName': 'Ken',
  'source': 'signal',
  'updatedAt': '2026-06-11T08:00:00.000Z',
};

const _accountDetail = {
  ..._accountSummary,
  'contacts': [
    {
      'id': 'contact-1',
      'fullName': 'Amalie Berg',
      'title': 'Daglig leder',
      'email': 'a@example.no',
      'phone': '+47 900 11 222',
      'isPrimary': true,
    },
  ],
  'deals': [
    {
      'id': 'deal-1',
      'title': 'Pilot',
      'stageName': 'Tilbud',
      'valueAmount': '95000',
      'currency': 'NOK',
      'status': 'open',
      'ownerName': 'Ken',
    },
  ],
  'activities': [
    {
      'id': 'activity-1',
      'title': 'Kvalifiser account',
      'body': null,
      'activityType': 'follow_up',
      'status': 'open',
      'dueAt': '2026-06-12T08:00:00.000Z',
      'ownerName': 'Ken',
    },
  ],
  'notes': [
    {
      'id': 'note-1',
      'body': 'Interessert i signaler.',
      'authorName': 'Ken',
      'createdAt': '2026-06-11T08:00:00.000Z',
    },
  ],
  'signals': [_linkedSignal],
};

const _openSignal = {
  'id': 'signal-1',
  'generatedSignalId': 'signal-1',
  'organizationId': 'org-2',
  'linkedAccountId': null,
  'orgnr': '956789123',
  'organizationName': 'Oslo Cloud Drift AS',
  'title': 'Ny virksomhet matcher IT/SaaS ICP',
  'reason': 'Aktivt AS i Oslo med NACE 62.020.',
  'score': 86,
  'status': 'new',
  'observedAt': '2026-06-11T08:00:00.000Z',
};

const _linkedSignal = {
  'id': 'crm-signal-1',
  'generatedSignalId': 'signal-2',
  'organizationId': 'org-1',
  'linkedAccountId': 'account-1',
  'orgnr': '923456789',
  'organizationName': 'Nordic Field Systems AS',
  'title': 'Watchlist-treff',
  'reason': 'Organisasjonen finnes i manuell watchlist.',
  'score': 91,
  'status': 'acted_on',
  'observedAt': '2026-06-11T08:00:00.000Z',
};
