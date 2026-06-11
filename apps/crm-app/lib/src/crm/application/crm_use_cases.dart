import '../domain/crm_models.dart';
import 'crm_repositories.dart';

class CreateAccountFromSignalUseCase {
  const CreateAccountFromSignalUseCase(this._crmRepository);

  final CrmRepository _crmRepository;

  Future<Account> call(String signalId) {
    return _crmRepository.createAccountFromSignal(signalId);
  }
}
