Pod::Spec.new do |s|
  s.name             = 'ContactPicker'
  s.version          = '1.0.0'
  s.summary          = 'System contact picker that returns a name and photo without Contacts permission'
  s.description      = 'Presents CNContactPickerViewController and hands back the picked contact\'s formatted name and a square photo.'
  s.author           = 'Color Up'
  s.homepage         = 'https://colorup.app'
  s.platforms        = { :ios => '15.1' }
  s.source           = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Contacts', 'ContactsUI'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
