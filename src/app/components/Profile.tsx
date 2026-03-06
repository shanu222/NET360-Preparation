import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { User, Mail, Calendar, Target, Award, Settings } from 'lucide-react';

export function Profile() {
  return (
    <div className="space-y-6">
      <div>
        <h1>Profile & Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-4">
                <AvatarImage src="" />
                <AvatarFallback className="text-2xl">ST</AvatarFallback>
              </Avatar>
              <h3>Student Name</h3>
              <p className="text-sm text-muted-foreground">student@example.com</p>
              <Button variant="outline" className="mt-4">Change Photo</Button>
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Member Since</span>
                <span className="text-sm">Jan 2026</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge>Premium</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tests Taken</span>
                <span className="text-sm">12</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input id="first-name" placeholder="John" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last Name</Label>
                <Input id="last-name" placeholder="Doe" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="student@example.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" placeholder="+92 300 1234567" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Select>
                <SelectTrigger id="city">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="islamabad">Islamabad</SelectItem>
                  <SelectItem value="rawalpindi">Rawalpindi</SelectItem>
                  <SelectItem value="lahore">Lahore</SelectItem>
                  <SelectItem value="karachi">Karachi</SelectItem>
                  <SelectItem value="peshawar">Peshawar</SelectItem>
                  <SelectItem value="quetta">Quetta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button>Save Changes</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            NET Preparation Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-program">Target Program</Label>
              <Select>
                <SelectTrigger id="target-program">
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cs">Computer Science</SelectItem>
                  <SelectItem value="ee">Electrical Engineering</SelectItem>
                  <SelectItem value="me">Mechanical Engineering</SelectItem>
                  <SelectItem value="ai">Artificial Intelligence</SelectItem>
                  <SelectItem value="se">Software Engineering</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-series">Target Test Series</Label>
              <Select>
                <SelectTrigger id="test-series">
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="series2">NET Series 2 (Feb 2026)</SelectItem>
                  <SelectItem value="series3">NET Series 3 (Apr 2026)</SelectItem>
                  <SelectItem value="series4">NET Series 4 (Jun 2026)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ssc-percentage">SSC/Matric Percentage</Label>
              <Input id="ssc-percentage" type="number" placeholder="85" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hssc-percentage">HSSC/Intermediate Percentage</Label>
              <Input id="hssc-percentage" type="number" placeholder="82" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-date">NET Test Date</Label>
            <Input id="test-date" type="date" />
          </div>

          <Button>Update Details</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg text-center">
              <div className="text-4xl mb-2">🏆</div>
              <h4>First Mock Test</h4>
              <p className="text-sm text-muted-foreground">Completed first full-length test</p>
            </div>
            <div className="p-4 border rounded-lg text-center">
              <div className="text-4xl mb-2">⚡</div>
              <h4>7 Day Streak</h4>
              <p className="text-sm text-muted-foreground">Practiced for 7 consecutive days</p>
            </div>
            <div className="p-4 border rounded-lg text-center">
              <div className="text-4xl mb-2">📚</div>
              <h4>100 Questions</h4>
              <p className="text-sm text-muted-foreground">Solved 100 practice questions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4>Email Notifications</h4>
              <p className="text-sm text-muted-foreground">Receive updates about tests and deadlines</p>
            </div>
            <Button variant="outline">Enabled</Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4>Daily Reminders</h4>
              <p className="text-sm text-muted-foreground">Get reminded to practice daily</p>
            </div>
            <Button variant="outline">Enabled</Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4>Performance Reports</h4>
              <p className="text-sm text-muted-foreground">Weekly summary of your progress</p>
            </div>
            <Button variant="outline">Enabled</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="mb-2 text-white">Upgrade to Premium</h3>
              <p className="text-blue-100 mb-4">
                Get access to unlimited mock tests, AI tutor, and personalized study plans
              </p>
              <Button variant="secondary">View Plans</Button>
            </div>
            <div className="text-6xl opacity-50">👑</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
