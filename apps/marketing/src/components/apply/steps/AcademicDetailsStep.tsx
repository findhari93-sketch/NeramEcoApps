'use client';

import {
  Box,
  TextField,
  Grid,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
  Card,
  CardContent,
  CardActionArea,
  Autocomplete,
} from '@neram/ui';
import {
  SchoolOutlined,
  BusinessOutlined,
  WorkOutlined,
  EngineeringOutlined,
} from '@mui/icons-material';
import { useFormContext } from '../FormContext';
import {
  CLASS_OPTIONS,
  YEAR_OF_STUDY_OPTIONS,
  COMPLETED_GRADE_OPTIONS,
  getExamYearOptions,
  get12thYearOptions,
} from '../types';
import {
  EDUCATION_BOARD_OPTIONS,
  CASTE_CATEGORY_OPTIONS,
  APPLICANT_CATEGORY_OPTIONS,
  type ApplicantCategory,
  type SchoolStudentAcademicData,
  type DiplomaStudentAcademicData,
  type CollegeStudentAcademicData,
  type WorkingProfessionalAcademicData,
} from '@neram/database';

// Category icons
const categoryIcons: Record<ApplicantCategory, React.ReactNode> = {
  school_student: <SchoolOutlined sx={{ fontSize: 40 }} />,
  diploma_student: <EngineeringOutlined sx={{ fontSize: 40 }} />,
  college_student: <BusinessOutlined sx={{ fontSize: 40 }} />,
  working_professional: <WorkOutlined sx={{ fontSize: 40 }} />,
};

export default function AcademicDetailsStep() {
  const { formData, updateFormData } = useFormContext();
  const { academic } = formData;

  const handleCategoryChange = (category: ApplicantCategory) => {
    // Reset category-specific data when changing category
    updateFormData('academic', {
      applicantCategory: category,
      schoolStudentData: null,
      diplomaStudentData: null,
      collegeStudentData: null,
      workingProfessionalData: null,
    });

    // Initialize with empty data for the selected category
    switch (category) {
      case 'school_student':
        updateFormData('academic', {
          schoolStudentData: {
            current_class: '',
            school_name: '',
            board: '',
            previous_percentage: undefined,
          },
        });
        break;
      case 'diploma_student':
        updateFormData('academic', {
          diplomaStudentData: {
            college_name: '',
            department: '',
            completed_grade: '10th',
            marks: undefined,
          },
        });
        break;
      case 'college_student':
        updateFormData('academic', {
          collegeStudentData: {
            college_name: '',
            department: '',
            year_of_study: 1,
            twelfth_year: new Date().getFullYear() - 1,
            twelfth_percentage: undefined,
            reason_for_exam: '',
          },
        });
        break;
      case 'working_professional':
        updateFormData('academic', {
          workingProfessionalData: {
            twelfth_year: new Date().getFullYear() - 5,
            occupation: '',
            company: '',
          },
        });
        break;
    }
  };

  const updateSchoolData = (data: Partial<SchoolStudentAcademicData>) => {
    updateFormData('academic', {
      schoolStudentData: {
        ...academic.schoolStudentData,
        ...data,
      } as SchoolStudentAcademicData,
    });
  };

  const updateDiplomaData = (data: Partial<DiplomaStudentAcademicData>) => {
    updateFormData('academic', {
      diplomaStudentData: {
        ...academic.diplomaStudentData,
        ...data,
      } as DiplomaStudentAcademicData,
    });
  };

  const updateCollegeData = (data: Partial<CollegeStudentAcademicData>) => {
    updateFormData('academic', {
      collegeStudentData: {
        ...academic.collegeStudentData,
        ...data,
      } as CollegeStudentAcademicData,
    });
  };

  const updateWorkingData = (data: Partial<WorkingProfessionalAcademicData>) => {
    updateFormData('academic', {
      workingProfessionalData: {
        ...academic.workingProfessionalData,
        ...data,
      } as WorkingProfessionalAcademicData,
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Academic Details
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Tell us about your educational background so we can recommend the best course for you.
      </Typography>

      {/* Category Selection */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Which best describes you? *
        </Typography>
        <Grid container spacing={2}>
          {APPLICANT_CATEGORY_OPTIONS.map((option) => (
            <Grid item xs={6} sm={3} key={option.value}>
              <Card
                variant={academic.applicantCategory === option.value ? 'elevation' : 'outlined'}
                sx={{
                  height: '100%',
                  borderColor:
                    academic.applicantCategory === option.value ? 'primary.main' : 'divider',
                  borderWidth: academic.applicantCategory === option.value ? 2 : 1,
                  bgcolor:
                    academic.applicantCategory === option.value ? 'primary.50' : 'background.paper',
                }}
              >
                <CardActionArea
                  onClick={() => handleCategoryChange(option.value)}
                  sx={{ height: '100%', p: 2, textAlign: 'center' }}
                >
                  <Box
                    sx={{
                      color:
                        academic.applicantCategory === option.value
                          ? 'primary.main'
                          : 'text.secondary',
                      mb: 1,
                    }}
                  >
                    {categoryIcons[option.value]}
                  </Box>
                  <Typography
                    variant="subtitle2"
                    fontWeight={academic.applicantCategory === option.value ? 700 : 500}
                  >
                    {option.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.description}
                  </Typography>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Category-Specific Fields */}
      {academic.applicantCategory && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Your Details
          </Typography>

          {/* School Student Fields */}
          {academic.applicantCategory === 'school_student' && (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Current Class</InputLabel>
                  <Select
                    value={academic.schoolStudentData?.current_class || ''}
                    onChange={(e) => updateSchoolData({ current_class: e.target.value })}
                    label="Current Class"
                  >
                    {CLASS_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Board</InputLabel>
                  <Select
                    value={academic.schoolStudentData?.board || ''}
                    onChange={(e) => updateSchoolData({ board: e.target.value })}
                    label="Board"
                  >
                    {EDUCATION_BOARD_OPTIONS.map((option) => (
                      <MenuItem key={option.code} value={option.code}>
                        {option.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="School Name"
                  required
                  value={academic.schoolStudentData?.school_name || ''}
                  onChange={(e) => updateSchoolData({ school_name: e.target.value })}
                  placeholder="Enter your school name"
                  helperText="Start typing to search for your school"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Previous Year Percentage (Optional)"
                  type="number"
                  value={academic.schoolStudentData?.previous_percentage || ''}
                  onChange={(e) =>
                    updateSchoolData({
                      previous_percentage: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  inputProps={{ min: 0, max: 100 }}
                  helperText="Your last academic year percentage"
                />
              </Grid>
            </Grid>
          )}

          {/* Diploma Student Fields */}
          {academic.applicantCategory === 'diploma_student' && (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Completed Before Diploma</InputLabel>
                  <Select
                    value={academic.diplomaStudentData?.completed_grade || '10th'}
                    onChange={(e) =>
                      updateDiplomaData({ completed_grade: e.target.value as '10th' | '12th' })
                    }
                    label="Completed Before Diploma"
                  >
                    {COMPLETED_GRADE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Department"
                  required
                  value={academic.diplomaStudentData?.department || ''}
                  onChange={(e) => updateDiplomaData({ department: e.target.value })}
                  placeholder="e.g., Civil Engineering, Architecture"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="College Name"
                  required
                  value={academic.diplomaStudentData?.college_name || ''}
                  onChange={(e) => updateDiplomaData({ college_name: e.target.value })}
                  placeholder="Enter your polytechnic/diploma college name"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Marks/Percentage (Optional)"
                  type="number"
                  value={academic.diplomaStudentData?.marks || ''}
                  onChange={(e) =>
                    updateDiplomaData({
                      marks: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  inputProps={{ min: 0, max: 100 }}
                />
              </Grid>
            </Grid>
          )}

          {/* College Student Fields */}
          {academic.applicantCategory === 'college_student' && (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="College Name"
                  required
                  value={academic.collegeStudentData?.college_name || ''}
                  onChange={(e) => updateCollegeData({ college_name: e.target.value })}
                  placeholder="Enter your college name"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Department"
                  required
                  value={academic.collegeStudentData?.department || ''}
                  onChange={(e) => updateCollegeData({ department: e.target.value })}
                  placeholder="e.g., Computer Science, Mechanical"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Year of Study</InputLabel>
                  <Select
                    value={academic.collegeStudentData?.year_of_study || ''}
                    onChange={(e) => updateCollegeData({ year_of_study: Number(e.target.value) })}
                    label="Year of Study"
                  >
                    {YEAR_OF_STUDY_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>12th Completed In</InputLabel>
                  <Select
                    value={academic.collegeStudentData?.twelfth_year || ''}
                    onChange={(e) => updateCollegeData({ twelfth_year: Number(e.target.value) })}
                    label="12th Completed In"
                  >
                    {get12thYearOptions().map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="12th Percentage (Optional)"
                  type="number"
                  value={academic.collegeStudentData?.twelfth_percentage || ''}
                  onChange={(e) =>
                    updateCollegeData({
                      twelfth_percentage: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  inputProps={{ min: 0, max: 100 }}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Why do you want to write the entrance exam? (Optional)"
                  multiline
                  rows={2}
                  value={academic.collegeStudentData?.reason_for_exam || ''}
                  onChange={(e) => updateCollegeData({ reason_for_exam: e.target.value })}
                  placeholder="e.g., Career change, interested in architecture"
                />
              </Grid>
            </Grid>
          )}

          {/* Working Professional Fields */}
          {academic.applicantCategory === 'working_professional' && (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>12th Completed In</InputLabel>
                  <Select
                    value={academic.workingProfessionalData?.twelfth_year || ''}
                    onChange={(e) => updateWorkingData({ twelfth_year: Number(e.target.value) })}
                    label="12th Completed In"
                  >
                    {get12thYearOptions().map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Current Occupation (Optional)"
                  value={academic.workingProfessionalData?.occupation || ''}
                  onChange={(e) => updateWorkingData({ occupation: e.target.value })}
                  placeholder="e.g., Software Engineer, Teacher"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Company/Organization (Optional)"
                  value={academic.workingProfessionalData?.company || ''}
                  onChange={(e) => updateWorkingData({ company: e.target.value })}
                />
              </Grid>
            </Grid>
          )}
        </Box>
      )}

      {/* Common Fields */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Additional Information
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Category</InputLabel>
              <Select
                value={academic.casteCategory || ''}
                onChange={(e) =>
                  updateFormData('academic', {
                    casteCategory: e.target.value as typeof academic.casteCategory,
                  })
                }
                label="Category"
              >
                {CASTE_CATEGORY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Planning to Write Exam In</InputLabel>
              <Select
                value={academic.targetExamYear || ''}
                onChange={(e) =>
                  updateFormData('academic', { targetExamYear: Number(e.target.value) })
                }
                label="Planning to Write Exam In"
              >
                {getExamYearOptions().map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
